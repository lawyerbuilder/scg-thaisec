/**
 * PDF OCR via the local `claude` CLI as a subprocess.
 *
 * Uses the user's Claude Max subscription (already authenticated on the
 * machine) — no API key, no Vercel AI Gateway quota. Trade-off: slower
 * per-call (~10-20s for cold start + processing) but rate limits are far
 * more generous than the free Gateway tier.
 *
 * Flow:
 *   1. Download the PDF to the scratchpad.
 *   2. Spawn `claude -p --allowedTools Read --add-dir <scratchpad> ...`
 *      with a prompt telling it to transcribe the file at the absolute
 *      path.
 *   3. Capture stdout as the transcription.
 *
 * Returns null on any failure — best-effort, same as ocr-pdf.ts.
 */

import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FETCH_UA =
  process.env.INGEST_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const CLAUDE_TIMEOUT_MS = 180_000; // 3 minutes per PDF

const OCR_PROMPT_TEMPLATE = (absPath: string) => `You are an OCR engine. Read the PDF at this absolute path:

${absPath}

Transcribe ALL text from the PDF verbatim. Output ONLY the transcribed text — no preamble, no "Here is the transcription:", no explanations, no markdown code fences, no commentary.

REQUIREMENTS
- Preserve paragraph breaks, numbered lists, Thai numerals (๑ ๒ ๓...), and Thai section markers (มาตรา, ข้อ).
- Preserve tabular content as GitHub-flavored markdown tables.
- Keep both Thai and English content where both appear.
- Include headers, footers, signatures, and dates verbatim.
- Do NOT summarize, paraphrase, or omit content.

If the PDF contains NO readable text (e.g. blank pages or pure images without text), respond with exactly: EMPTY`;

export async function ocrPdfViaClaude(url: string): Promise<string | null> {
  // 1. Download the PDF
  let buffer: Buffer;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": FETCH_UA,
        Accept: "application/pdf",
        Referer: "https://capital.sec.or.th/",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn(`[ocr-claude] fetch ${url} → HTTP ${res.status}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0) return null;
    if (ab.byteLength > MAX_PDF_BYTES) {
      console.warn(`[ocr-claude] ${url} too large (${ab.byteLength} bytes)`);
      return null;
    }
    buffer = Buffer.from(ab);
  } catch (err) {
    console.warn(`[ocr-claude] fetch error: ${(err as Error).message}`);
    return null;
  }

  // 2. Write to temp file
  const tempDir = await mkdtemp(join(tmpdir(), "scg-ocr-"));
  const pdfPath = join(tempDir, "doc.pdf");
  try {
    await writeFile(pdfPath, buffer);

    // 3. Spawn claude
    const text = await runClaude(pdfPath, tempDir);
    if (!text) return null;
    const trimmed = text.trim();
    if (trimmed === "EMPTY") return null;
    return trimmed;
  } catch (err) {
    console.warn(`[ocr-claude] subprocess failed: ${(err as Error).message?.slice(0, 200)}`);
    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runClaude(pdfPath: string, addDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const prompt = OCR_PROMPT_TEMPLATE(pdfPath);
    // Pass prompt via stdin instead of as a CLI argument — avoids the Windows
    // shell-quoting problem (the prompt has newlines, slashes, Thai chars,
    // and the absolute path is a heavy quoting target). claude reads from
    // stdin when `--print` is set and no prompt arg is given.
    // Note: do NOT pass --bare. It disables OAuth/keychain auth which is how
    // Claude Max sessions are signed in. With --bare you'd need ANTHROPIC_API_KEY.
    const args = [
      "--print",
      "--output-format", "text",
      "--allowedTools", "Read",
      "--add-dir", addDir,
      "--permission-mode", "bypassPermissions",
      "--no-session-persistence",
      "--model", "haiku",
    ];

    const isWindows = process.platform === "win32";
    const child = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows,
      windowsHide: true,
    });

    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, CLAUDE_TIMEOUT_MS);

    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`claude timed out after ${CLAUDE_TIMEOUT_MS}ms`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `claude exited ${code}. stderr: ${stderr.slice(0, 300)}`
          )
        );
        return;
      }
      resolve(stdout);
    });
  });
}
