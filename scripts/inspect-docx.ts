/**
 * Quick inspector for .docx files — dumps the extracted text so we can see
 * the Q&A structure before writing a parser. Usage:
 *   npm run inspect:docx -- "C:\path\to\file.docx"
 */
import fs from "node:fs";
import mammoth from "mammoth";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npm run inspect:docx -- <path-to-docx>");
    process.exit(1);
  }
  const buf = fs.readFileSync(path);
  const result = await mammoth.extractRawText({ buffer: buf });
  console.log(`=== ${path} (${result.value.length} chars) ===\n`);
  console.log(result.value);
}

main().then(() => process.exit(0));
