/**
 * OCR backfill for regulations that have a working PDF but no extracted body.
 *
 * Identifies rows where:
 *   - body_th is null/empty (no text yet)
 *   - AND at least one of pdf_text_url / pdf_url is non-null (we have a PDF
 *     to send to OCR)
 *
 * For each, downloads the best-available PDF (prefer signed scan over text-
 * layer when we're doing OCR — they're equivalent for image-only docs), OCRs
 * it via Vercel AI Gateway → Gemini Flash, stores the result in body_th,
 * refreshes the row's embedding.
 *
 * Usage:
 *   npm run backfill:ocr                # all eligible
 *   npm run backfill:ocr -- --limit 3   # smoke test
 *   npm run backfill:ocr -- --ids 866,867
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ocrPdf } from "@/lib/ocr-pdf";
import { storeRegulationEmbedding, regulationEmbeddingText } from "@/lib/embeddings";

const PER_CALL_DELAY_MS = 1000;

interface CliFlags {
  limit: number | null;
  ids: number[] | null;
}

function parseFlags(): CliFlags {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  let ids: number[] | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = n;
      i += 1;
    } else if (argv[i] === "--ids") {
      const raw = argv[i + 1] ?? "";
      ids = raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      i += 1;
    }
  }
  return { limit, ids };
}

interface Row extends Record<string, unknown> {
  id: number;
  title_th: string;
  title_en: string | null;
  pdf_url: string | null;
  pdf_text_url: string | null;
  body_en: string | null;
}

async function main() {
  const flags = parseFlags();
  const limitClause = flags.limit ? sql`LIMIT ${flags.limit}` : sql``;
  const idsClause = flags.ids?.length
    ? sql`AND id = ANY(${sql.raw(`ARRAY[${flags.ids.join(",")}]::int[]`)})`
    : sql``;

  const rows = await db.execute<Row>(sql`
    SELECT id, title_th, title_en, pdf_url, pdf_text_url, body_en
    FROM regulations
    WHERE (body_th IS NULL OR length(body_th) < 50)
      AND (pdf_text_url IS NOT NULL OR pdf_url IS NOT NULL)
      ${idsClause}
    ORDER BY id
    ${limitClause}
  `);

  console.log(`[ocr] ${rows.rows.length} eligible regulations`);
  let ok = 0;
  let empty = 0;
  let fail = 0;

  for (const [i, r] of rows.rows.entries()) {
    const tag = `[${i + 1}/${rows.rows.length}] reg ${r.id}`;
    console.log(`${tag} ${r.title_th.slice(0, 70)}…`);
    // Prefer text-layer PDF (smaller, sometimes has selectable text the model
    // can also "read"); fall back to signed scan
    const url = r.pdf_text_url ?? r.pdf_url;
    if (!url) {
      fail += 1;
      continue;
    }
    const text = await ocrPdf(url);
    if (!text) {
      empty += 1;
      console.log(`  ↩ no text extracted`);
      await sleep(PER_CALL_DELAY_MS);
      continue;
    }
    const wc = text.split(/\s+/).filter(Boolean).length;
    await db.execute(sql`
      UPDATE regulations SET body_th = ${text}, word_count = ${wc} WHERE id = ${r.id}
    `);
    await storeRegulationEmbedding(
      r.id,
      regulationEmbeddingText({
        titleTh: r.title_th,
        titleEn: r.title_en,
        bodyTh: text,
        bodyEn: r.body_en,
      })
    );
    ok += 1;
    console.log(`  ✓ ${wc} words`);
    await sleep(PER_CALL_DELAY_MS);
  }

  console.log(`\n[ocr] DONE — ok=${ok}, empty=${empty}, fail=${fail}`);
  if (ok > 0) {
    console.log(
      `[ocr] Tip: run \`npm run backfill:translations -- regs\` to add English translations for the new content.`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ocr] fatal:", err);
    process.exit(1);
  });
