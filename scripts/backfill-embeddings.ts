/**
 * Backfills `embedding` for any faqs/regulations rows that don't have one yet.
 * Runs sequentially with a small delay between calls so we don't hammer the
 * embedding provider's rate limits.
 *
 * Usage:
 *   npm run backfill:embeddings              # both tables
 *   npm run backfill:embeddings -- faqs      # just faqs
 *   npm run backfill:embeddings -- regs      # just regulations
 *
 * Requires AI_GATEWAY_API_KEY in .env.local (or VERCEL=1 runtime). Without it,
 * the helper short-circuits and the script reports 0 updates.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  storeFaqEmbedding,
  storeRegulationEmbedding,
  faqEmbeddingText,
  regulationEmbeddingText,
} from "@/lib/embeddings";

const PER_CALL_DELAY_MS = 100;

async function backfillFaqs() {
  const rows = await db.execute<{
    id: number;
    question_th: string;
    question_en: string | null;
    answer_th: string;
    answer_en: string | null;
  }>(sql`
    SELECT id, question_th, question_en, answer_th, answer_en
    FROM faqs
    WHERE embedding IS NULL
    ORDER BY id
  `);
  console.log(`[backfill] faqs: ${rows.rows.length} missing embeddings`);
  let ok = 0;
  let fail = 0;
  for (const [i, r] of rows.rows.entries()) {
    const text = faqEmbeddingText({
      questionTh: r.question_th,
      questionEn: r.question_en,
      answerTh: r.answer_th,
      answerEn: r.answer_en,
    });
    const stored = await storeFaqEmbedding(r.id, text);
    if (stored) ok += 1;
    else fail += 1;
    if ((i + 1) % 20 === 0) {
      console.log(`  [faq] ${i + 1}/${rows.rows.length} (ok=${ok} fail=${fail})`);
    }
    await sleep(PER_CALL_DELAY_MS);
  }
  console.log(`[backfill] faqs done — ok=${ok} fail=${fail}`);
}

async function backfillRegulations() {
  const rows = await db.execute<{
    id: number;
    title_th: string;
    title_en: string | null;
    body_th: string | null;
    body_en: string | null;
  }>(sql`
    SELECT id, title_th, title_en, body_th, body_en
    FROM regulations
    WHERE embedding IS NULL
      AND length(coalesce(body_th, '') || coalesce(body_en, '')) >= 50
    ORDER BY id
  `);
  console.log(`[backfill] regulations: ${rows.rows.length} missing embeddings (body >= 50 chars)`);
  let ok = 0;
  let fail = 0;
  for (const [i, r] of rows.rows.entries()) {
    const text = regulationEmbeddingText({
      titleTh: r.title_th,
      titleEn: r.title_en,
      bodyTh: r.body_th,
      bodyEn: r.body_en,
    });
    const stored = await storeRegulationEmbedding(r.id, text);
    if (stored) ok += 1;
    else fail += 1;
    if ((i + 1) % 10 === 0) {
      console.log(`  [reg] ${i + 1}/${rows.rows.length} (ok=${ok} fail=${fail})`);
    }
    await sleep(PER_CALL_DELAY_MS);
  }
  console.log(`[backfill] regulations done — ok=${ok} fail=${fail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const arg = process.argv[2];
  const keyPresent = !!process.env.AI_GATEWAY_API_KEY || process.env.VERCEL === "1";
  if (!keyPresent) {
    console.error(
      "[backfill] AI_GATEWAY_API_KEY is not set. Add it to .env.local:\n" +
        "  AI_GATEWAY_API_KEY=ak_...\n\n" +
        "Get one from: Vercel dashboard → your project → AI Gateway → API Keys"
    );
    process.exit(1);
  }
  if (!arg || arg === "faqs") await backfillFaqs();
  if (!arg || arg === "regs") await backfillRegulations();
  console.log("[backfill] all done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] fatal:", err);
    process.exit(1);
  });
