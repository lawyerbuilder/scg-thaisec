/**
 * PDF OCR via Vercel AI Gateway → Gemini Flash.
 *
 * Why Gemini Flash specifically:
 *   - Accepts PDF files directly as input (no client-side image conversion).
 *   - Multi-page PDFs handled internally by the model.
 *   - Strong Thai-script recognition including stacked vowels/tones.
 *   - Cheap: ~$0.001 per page through AI Gateway.
 *
 * Auth: same as the embeddings module — AI_GATEWAY_API_KEY OR
 * VERCEL_OIDC_TOKEN OR VERCEL=1 runtime. Best-effort: returns null on
 * any failure so callers degrade gracefully.
 *
 * Fetch headers mirror lib/pdf.ts (proper Referer for SEC's CDN).
 */

import { generateText } from "ai";

// 2.0-flash-lite was retired from AI Gateway. 2.5 is the current generation
// and the only one that handles PDFs in the Lite tier cheaply. Keep the array
// shape so it's easy to add a fallback if 2.5 ever gets gated.
const MODEL = "google/gemini-2.5-flash-lite";
const FALLBACK_MODEL = "google/gemini-2.5-flash";
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB ceiling
const FETCH_UA =
  process.env.INGEST_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const OCR_PROMPT = `Transcribe ALL text from this Thai legal document verbatim into a single text block.

REQUIREMENTS
- Preserve paragraph breaks, numbered lists (1, 2, 3...), Thai numerals (๑ ๒ ๓...), and section markers (มาตรา, ข้อ).
- Preserve table content as GitHub-flavored markdown tables when the source has tabular structure.
- Keep both Thai and English content where both appear.
- Include headers, footers, signatures, and dates verbatim.
- Do NOT summarize, paraphrase, omit content, or add commentary.
- Output ONLY the transcribed text. No "Here is the transcription:" preamble. No explanations.

If the document contains no readable text (e.g. blank pages, pure images with no text content), output the single word: EMPTY`;

function hasAuth(): boolean {
  return (
    !!process.env.AI_GATEWAY_API_KEY ||
    !!process.env.VERCEL_OIDC_TOKEN ||
    process.env.VERCEL === "1"
  );
}

/**
 * Download a PDF and OCR it via the AI Gateway. Returns the transcribed text
 * or null on failure. Skips files that exceed MAX_PDF_BYTES.
 */
export async function ocrPdf(url: string): Promise<string | null> {
  if (!hasAuth()) {
    console.warn(`[ocr-pdf] no AI Gateway auth (set AI_GATEWAY_API_KEY or vercel env pull)`);
    return null;
  }

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
      console.warn(`[ocr-pdf] fetch ${url} → HTTP ${res.status}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0) return null;
    if (ab.byteLength > MAX_PDF_BYTES) {
      console.warn(`[ocr-pdf] ${url} too large (${ab.byteLength} bytes) — skipping`);
      return null;
    }
    buffer = Buffer.from(ab);
  } catch (err) {
    console.warn(`[ocr-pdf] fetch error: ${(err as Error).message}`);
    return null;
  }

  // Only try the primary model. Falling back when rate-limited just burns
  // through the same per-minute budget on a different model without helping.
  // Re-enable the fallback array if 2.5-flash-lite is ever retired or 503s.
  for (const model of [MODEL]) {
    try {
      const result = await generateText({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "file", mediaType: "application/pdf", data: buffer },
            ],
          },
        ],
        temperature: 0,
      });
      const text = result.text?.trim();
      if (!text) {
        console.warn(`[ocr-pdf] ${model} returned empty`);
        continue;
      }
      if (text === "EMPTY") {
        // Model successfully determined the PDF has no readable text
        return null;
      }
      return text;
    } catch (err) {
      console.warn(`[ocr-pdf] ${model} failed: ${(err as Error).message?.slice(0, 200)}`);
    }
  }
  return null;
}
