/**
 * Loads pre-written Q&A from the SCG AGM playbook (Section 4) into the `faqs`
 * table as status='verified', source='imported'.
 *
 * Awaiting `.docx` versions of the three legacy `.doc` files. Once provided,
 * the actual Q&A parser goes here.
 *
 * Usage:
 *   npm run load:faqs -- "<path-to-folder-containing-QA-docx-files>"
 */

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const folder = args[0];

if (!folder) {
  console.error(
    "[load-faqs] missing path arg.\n" +
      "Usage: npm run load:faqs -- <path-to-docx-folder>\n\n" +
      "Expected files in that folder:\n" +
      "  - QA_Legal_AGM.docx\n" +
      "  - QA_Legal_Litigation.docx\n" +
      "  - QA_Legal_PDPA.docx"
  );
  process.exit(1);
}

const expected = ["QA_Legal_AGM.docx", "QA_Legal_Litigation.docx", "QA_Legal_PDPA.docx"];
const missing = expected.filter((f) => !fs.existsSync(path.join(folder, f)));

if (missing.length > 0) {
  console.error(
    `[load-faqs] missing ${missing.length} file(s) in ${folder}:\n  ${missing.join("\n  ")}\n\n` +
      "Convert the .doc files in Word (File → Save As → .docx) and place them here."
  );
  process.exit(1);
}

console.log(
  "[load-faqs] found all 3 .docx files. The Q&A parser is not implemented yet — " +
    "share the file contents with Claude so the parsing logic can be tailored to " +
    "the actual structure (numbered list? table? Q:/A: prefixes?)."
);
process.exit(0);
