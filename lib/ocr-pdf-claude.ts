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
import { getDocumentProxy } from "unpdf";

const FETCH_UA =
  process.env.INGEST_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MAX_PDF_BYTES = 20 * 1024 * 1024;
// 6 minutes default — big SEC notifications run 50+ pages. Override per-run
// with OCR_CLAUDE_TIMEOUT_MS for the occasional monster document.
const CLAUDE_TIMEOUT_MS = Number(process.env.OCR_CLAUDE_TIMEOUT_MS) || 360_000;

const OCR_PROMPT_TEMPLATE = (absPath: string, pages?: string) => `You are an OCR engine. Read the PDF at this absolute path:

${absPath}
${pages ? `\nRead ONLY pages ${pages} (pass pages: "${pages}" to the Read tool) and transcribe only those pages.` : `\nThe Read tool caps PDFs at 10 pages per call. If the document is longer, call Read repeatedly with the pages parameter ("1-10", then "11-20", and so on) until you have read every page. Do not stop early.`}

Transcribe ALL text from the PDF verbatim. Output ONLY the transcribed text — no preamble, no "Here is the transcription:", no explanations, no markdown code fences, no commentary.

REQUIREMENTS
- Preserve paragraph breaks, numbered lists, Thai numerals (๑ ๒ ๓...), and Thai section markers (มาตรา, ข้อ).
- Preserve tabular content as GitHub-flavored markdown tables.
- Keep both Thai and English content where both appear.
- Include headers, footers, signatures, and dates verbatim.
- Do NOT summarize, paraphrase, or omit content.

If the PDF contains NO readable text (e.g. blank pages or pure images without text), respond with exactly: EMPTY`;

/**
 * Reject model output that is assistant chatter rather than a transcription.
 * Failure mode observed on reg 695 (82-page scan): the model gave up mid-way
 * and returned "Would you like me to extract specific page ranges?" — which
 * the pipeline then stored as the document body. Tuned for the Thai SEC
 * corpus: real transcriptions are predominantly Thai script.
 */
export function looksLikeTranscription(text: string): boolean {
  const head = text.slice(0, 400).toLowerCase();
  const tail = text.slice(-400).toLowerCase();
  const CHATTER = [
    "i'll provide",
    "i'll continue",
    "i've successfully",
    "here's the content",
    "here is the transcription",
    "based on the extraction",
    "would you like",
    "let me know if",
  ];
  if (CHATTER.some((c) => head.includes(c) || tail.includes(c))) return false;
  const thaiChars = (text.match(/[฀-๿]/g) ?? []).length;
  return thaiChars / text.length >= 0.1;
}

async function downloadPdf(url: string): Promise<Buffer | null> {
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
    return Buffer.from(ab);
  } catch (err) {
    console.warn(`[ocr-claude] fetch error: ${(err as Error).message}`);
    return null;
  }
}

// Documents longer than this are OCR'd in CHUNK_PAGES ranges, one claude
// call per range, concatenated. Single-shot transcription of 80-page scans
// fails in practice: the model runs out of steam and starts chatting.
const AUTO_CHUNK_THRESHOLD = 12;
const CHUNK_PAGES = 10;

async function pdfPageCount(buffer: Buffer): Promise<number | null> {
  try {
    const u8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const doc = await getDocumentProxy(u8);
    return doc.numPages;
  } catch {
    return null;
  }
}

/** One claude invocation over the whole doc or a page range, validated. */
async function ocrOnce(
  pdfPath: string,
  addDir: string,
  pages?: string
): Promise<string | null> {
  try {
    const text = await runClaude(pdfPath, addDir, pages);
    const trimmed = text?.trim();
    if (!trimmed || trimmed === "EMPTY") return null;
    if (!looksLikeTranscription(trimmed)) {
      console.warn(
        `[ocr-claude] output rejected by validation gate (chatter or non-Thai): ${trimmed.slice(0, 80)}…`
      );
      return null;
    }
    return trimmed;
  } catch (err) {
    console.warn(`[ocr-claude] subprocess failed: ${(err as Error).message?.slice(0, 200)}`);
    return null;
  }
}

export async function ocrPdfViaClaude(
  url: string,
  opts: { pages?: string } = {}
): Promise<string | null> {
  const buffer = await downloadPdf(url);
  if (!buffer) return null;

  const tempDir = await mkdtemp(join(tmpdir(), "scg-ocr-"));
  const pdfPath = join(tempDir, "doc.pdf");
  try {
    await writeFile(pdfPath, buffer);

    // Caller pinned an explicit range → single call, no auto-chunking.
    if (opts.pages) return await ocrOnce(pdfPath, tempDir, opts.pages);

    const pageCount = await pdfPageCount(buffer);
    if (pageCount === null || pageCount <= AUTO_CHUNK_THRESHOLD) {
      return await ocrOnce(pdfPath, tempDir);
    }

    // Chunked mode for long documents.
    console.log(`[ocr-claude] ${pageCount} pages — chunking into ranges of ${CHUNK_PAGES}`);
    const parts: string[] = [];
    const skipped: string[] = [];
    for (let start = 1; start <= pageCount; start += CHUNK_PAGES) {
      const end = Math.min(start + CHUNK_PAGES - 1, pageCount);
      const range = `${start}-${end}`;
      const chunk = await ocrOnce(pdfPath, tempDir, range);
      if (chunk) parts.push(chunk);
      else skipped.push(range);
    }
    if (skipped.length > 0) {
      console.warn(
        `[ocr-claude] ${skipped.length}/${Math.ceil(pageCount / CHUNK_PAGES)} chunks skipped (blank or rejected): ${skipped.join(", ")}`
      );
    }
    return parts.length > 0 ? parts.join("\n\n") : null;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runClaude(pdfPath: string, addDir: string, pages?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const prompt = OCR_PROMPT_TEMPLATE(pdfPath, pages);
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
    // Image-only PDFs need poppler (pdftoppm) on the child's PATH so the
    // Read tool can rasterize pages. Shells often have a stale PATH (e.g.
    // opened before poppler was installed), so POPPLER_BIN in .env.local
    // injects it explicitly.
    const env = { ...process.env };
    if (process.env.POPPLER_BIN) {
      const sep = isWindows ? ";" : ":";
      env.PATH = `${process.env.POPPLER_BIN}${sep}${env.PATH ?? ""}`;
    }
    const child = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows,
      windowsHide: true,
      env,
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
