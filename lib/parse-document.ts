/**
 * Text extraction for uploaded documents.
 * Supports: PDF (via unpdf), DOCX (via mammoth), plain text.
 */

import { extractText } from "unpdf";
import mammoth from "mammoth";

export type SupportedMime =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "text/plain"
  | "text/markdown";

export const SUPPORTED_MIMES: SupportedMime[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

export interface ExtractedDocument {
  text: string;
  pageCount: number | null;
}

export async function extractFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractedDocument> {
  const lowerName = filename.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return extractPdf(buffer);
  }
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    return extractDocx(buffer);
  }
  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md")
  ) {
    return { text: buffer.toString("utf-8").trim(), pageCount: null };
  }
  throw new Error(
    `Unsupported file type "${mimeType}" / "${filename}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`
  );
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  // unpdf expects a Uint8Array
  const u8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const result = await extractText(u8, { mergePages: true });
  // mergePages:true returns string; we narrow defensively just in case
  const text = Array.isArray(result.text) ? result.text.join("\n\n") : String(result.text ?? "");
  return { text: text.trim(), pageCount: result.totalPages ?? null };
}

async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value.trim(), pageCount: null };
}

/**
 * Rough word-equivalent count. Thai has no spaces; this counts whitespace
 * tokens and treats Thai chunks as one each — a stand-in, not exact.
 */
export function countWords(s: string): number {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}
