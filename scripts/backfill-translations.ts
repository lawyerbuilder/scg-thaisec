/**
 * Backfills English translations for any rows that are Thai-only.
 *
 *   - regulations: where title_en IS NULL or body_en IS NULL (and the Thai
 *     counterpart has substantive content)
 *   - faqs:        where question_en IS NULL or answer_en IS NULL
 *
 * Uses Groq with strict JSON schema for translation. Retries on the model's
 * occasional json_validate_failed quirk by lowering temperature and swapping
 * to a fallback model.
 *
 * Resumable: re-runs only touch rows that still have NULL English fields.
 *
 * Usage:
 *   npm run backfill:translations                  # both tables, full bodies
 *   npm run backfill:translations -- --titles-only # fast pass, titles only
 *   npm run backfill:translations -- regs          # regulations only
 *   npm run backfill:translations -- faqs          # faqs only
 *   npm run backfill:translations -- --limit 5     # smoke test on 5 rows
 *
 * Rate limit: free Groq tier is 8k TPM. We sequentialize calls with an
 * 800ms delay (CLAUDE.md gotcha #5).
 */

import { sql } from "drizzle-orm";
import Groq from "groq-sdk";
import { db } from "@/lib/db";
import { storeFaqEmbedding, storeRegulationEmbedding, faqEmbeddingText, regulationEmbeddingText } from "@/lib/embeddings";

const PER_CALL_DELAY_MS = 800;
const MAX_ATTEMPTS = 3;
const FALLBACK_MODELS = [
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];
const MAX_BODY_CHARS = 8000; // ~2000 tokens
const MIN_TH_CHARS = 50;

interface CliFlags {
  table: "regs" | "faqs" | "both";
  titlesOnly: boolean;
  limit: number | null;
}

function parseFlags(): CliFlags {
  const argv = process.argv.slice(2);
  let table: CliFlags["table"] = "both";
  let titlesOnly = false;
  let limit: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "regs" || a === "regulations") table = "regs";
    else if (a === "faqs") table = "faqs";
    else if (a === "--titles-only") titlesOnly = true;
    else if (a === "--limit") {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = n;
      i += 1;
    }
  }
  return { table, titlesOnly, limit };
}

const REG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title_en: {
      type: "string",
      description:
        "Faithful English translation of the Thai title. Preserve regulation numbers and section refs.",
    },
    body_en: {
      type: "string",
      description:
        "Faithful English translation of the Thai body. Preserve structure (paragraphs, tables, numbered items, citations like มาตรา 103 → Section 103). Do NOT summarize.",
    },
  },
  required: ["title_en", "body_en"],
} as const;

const REG_TITLE_ONLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title_en: { type: "string" },
  },
  required: ["title_en"],
} as const;

const FAQ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    question_en: {
      type: "string",
      description: "Faithful English translation of the Thai question.",
    },
    answer_en: {
      type: "string",
      description:
        "Faithful English translation of the Thai answer. Preserve legal precision and any section citations.",
    },
  },
  required: ["question_en", "answer_en"],
} as const;

async function groqStructured<T>(
  groq: Groq,
  prompt: string,
  schema: Record<string, unknown>,
  schemaName: string
): Promise<T | null> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = attempt === 0 ? FALLBACK_MODELS[0] : FALLBACK_MODELS[1] ?? FALLBACK_MODELS[0];
    const temperature = Math.max(0.0, 0.1 - attempt * 0.05);
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, schema, strict: true },
        },
        temperature,
        max_tokens: 4096,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("empty response");
      const parsed = JSON.parse(content) as T;
      if (process.env.TRANSLATE_DEBUG) {
        console.log(`  [debug] model=${model} response: ${content.slice(0, 200)}`);
      }
      return parsed;
    } catch (err) {
      lastError = err as Error;
      console.warn(
        `  attempt ${attempt + 1}/${MAX_ATTEMPTS} on ${model} failed: ${lastError.message.slice(0, 200)}`
      );
    }
  }
  console.warn(`  giving up — ${lastError?.message?.slice(0, 200)}`);
  return null;
}

interface RegRow extends Record<string, unknown> {
  id: number;
  title_th: string;
  title_en: string | null;
  body_th: string | null;
  body_en: string | null;
}

async function backfillRegulations(groq: Groq, flags: CliFlags): Promise<void> {
  const where = flags.titlesOnly
    ? sql`(title_en IS NULL OR title_en = '') AND title_th IS NOT NULL`
    : sql`((title_en IS NULL OR title_en = '') OR (body_en IS NULL AND length(coalesce(body_th, '')) >= ${MIN_TH_CHARS}))
          AND title_th IS NOT NULL`;
  const limitClause = flags.limit ? sql`LIMIT ${flags.limit}` : sql``;
  const rows = await db.execute<RegRow>(sql`
    SELECT id, title_th, title_en, body_th, body_en
    FROM regulations
    WHERE ${where}
    ORDER BY id
    ${limitClause}
  `);

  console.log(`[translate-regs] ${rows.rows.length} regulations to translate${flags.titlesOnly ? " (titles only)" : ""}`);
  let ok = 0;
  let fail = 0;

  for (const [i, r] of rows.rows.entries()) {
    const tag = `[${i + 1}/${rows.rows.length}] reg ${r.id}`;
    console.log(`${tag} ${r.title_th.slice(0, 70)}…`);

    if (flags.titlesOnly) {
      const result = await groqStructured<{ title_en: string }>(
        groq,
        `Translate this Thai legal title to clear English. Preserve regulation numbers (e.g. "ที่ กช. 1/2555") and SEC abbreviations.\n\nThai title:\n${r.title_th}\n\nReturn JSON.`,
        REG_TITLE_ONLY_SCHEMA,
        "reg_title_translation"
      );
      if (result?.title_en) {
        await db.execute(sql`UPDATE regulations SET title_en = ${result.title_en} WHERE id = ${r.id}`);
        ok += 1;
        console.log(`  ✓ ${result.title_en.slice(0, 80)}`);
      } else {
        fail += 1;
      }
    } else {
      const body = (r.body_th ?? "").slice(0, MAX_BODY_CHARS);
      const truncated = (r.body_th?.length ?? 0) > MAX_BODY_CHARS;
      const result = await groqStructured<{ title_en: string; body_en: string }>(
        groq,
        `Translate this Thai legal text to clear English. Stay faithful — do not summarize. Preserve regulation numbers, section citations (มาตรา → Section), structure (paragraphs, lists, tables).${truncated ? "\n\n(Note: body has been truncated to fit context — translate what you receive.)" : ""}\n\nTITLE (Thai):\n${r.title_th}\n\nBODY (Thai):\n${body}\n\nReturn JSON with title_en and body_en.`,
        REG_SCHEMA,
        "reg_translation"
      );
      if (result?.title_en) {
        const bodyEnToSave = result.body_en?.trim() || null;
        await db.execute(sql`
          UPDATE regulations
          SET title_en = ${result.title_en},
              body_en = coalesce(${bodyEnToSave}, body_en)
          WHERE id = ${r.id}
        `);
        await storeRegulationEmbedding(
          r.id,
          regulationEmbeddingText({
            titleTh: r.title_th,
            titleEn: result.title_en,
            bodyTh: r.body_th,
            bodyEn: bodyEnToSave ?? r.body_en,
          })
        );
        ok += 1;
        console.log(
          `  ✓ translated${bodyEnToSave ? ` (${bodyEnToSave.length} chars EN body)` : " (title only — body was empty)"}`
        );
      } else {
        fail += 1;
      }
    }
    await sleep(PER_CALL_DELAY_MS);
  }
  console.log(`[translate-regs] done — ok=${ok} fail=${fail}`);
}

interface FaqRow extends Record<string, unknown> {
  id: number;
  question_th: string;
  question_en: string | null;
  answer_th: string;
  answer_en: string | null;
}

async function backfillFaqs(groq: Groq, flags: CliFlags): Promise<void> {
  const limitClause = flags.limit ? sql`LIMIT ${flags.limit}` : sql``;
  const rows = await db.execute<FaqRow>(sql`
    SELECT id, question_th, question_en, answer_th, answer_en
    FROM faqs
    WHERE (question_en IS NULL OR question_en = '' OR answer_en IS NULL OR answer_en = '')
      AND question_th IS NOT NULL AND answer_th IS NOT NULL
    ORDER BY id
    ${limitClause}
  `);

  console.log(`[translate-faqs] ${rows.rows.length} FAQs to translate`);
  let ok = 0;
  let fail = 0;

  for (const [i, f] of rows.rows.entries()) {
    const tag = `[${i + 1}/${rows.rows.length}] faq ${f.id}`;
    console.log(`${tag} ${f.question_th.slice(0, 70)}…`);

    const result = await groqStructured<{ question_en: string; answer_en: string }>(
      groq,
      `Translate this Thai legal Q&A pair to clear English. Stay faithful — do not summarize. Preserve legal precision and any section citations (มาตรา → Section).\n\nQuestion (Thai):\n${f.question_th}\n\nAnswer (Thai):\n${f.answer_th}\n\nReturn JSON with question_en and answer_en.`,
      FAQ_SCHEMA,
      "faq_translation"
    );
    if (result?.question_en && result?.answer_en) {
      await db.execute(sql`
        UPDATE faqs
        SET question_en = ${result.question_en},
            answer_en = ${result.answer_en},
            updated_at = now()
        WHERE id = ${f.id}
      `);
      await storeFaqEmbedding(
        f.id,
        faqEmbeddingText({
          questionTh: f.question_th,
          questionEn: result.question_en,
          answerTh: f.answer_th,
          answerEn: result.answer_en,
        })
      );
      ok += 1;
      console.log(`  ✓ ${result.question_en.slice(0, 80)}`);
    } else {
      fail += 1;
    }
    await sleep(PER_CALL_DELAY_MS);
  }
  console.log(`[translate-faqs] done — ok=${ok} fail=${fail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[backfill-translations] GROQ_API_KEY not set in .env.local");
    process.exit(1);
  }
  const flags = parseFlags();
  const groq = new Groq({ apiKey });

  if (flags.table === "regs" || flags.table === "both") {
    await backfillRegulations(groq, flags);
  }
  if (flags.table === "faqs" || flags.table === "both") {
    await backfillFaqs(groq, flags);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-translations] fatal:", err);
    process.exit(1);
  });
