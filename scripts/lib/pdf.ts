import { extractText, getDocumentProxy } from "unpdf";

const DEFAULT_UA =
  process.env.INGEST_USER_AGENT ??
  "Mozilla/5.0 (compatible; SCGThaiSECBot/0.1; +https://scg-thaisec.vercel.app)";

/**
 * Download a PDF and extract its text. Returns null on any failure
 * (403, network error, encrypted PDF, scanned-only PDF with no text
 * layer, …). Callers should treat null as "couldn't extract" rather
 * than "doesn't exist".
 */
export async function extractPdfText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept: "application/pdf",
        Referer: "https://capital.sec.or.th/",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === "string" ? text.trim() : null;
  } catch {
    return null;
  }
}

export function wordCount(s: string | null | undefined): number {
  if (!s) return 0;
  // Approximate: split on whitespace + Thai sara-/yamakkan space.
  return s.split(/\s+/).filter(Boolean).length;
}
