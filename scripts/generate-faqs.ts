/**
 * Generates AI Q&A pairs from the AGM playbook content via Groq.
 *
 * For each `regulations` row with source_type='internal_playbook' and a
 * non-empty body, asks Groq's `openai/gpt-oss-20b` (json_schema-capable —
 * see CLAUDE.md gotcha #4) to draft 3-5 questions a lawyer would actually
 * ask, with answers grounded ONLY in the supplied playbook content. Saves
 * each as a `faqs` row: status='draft', source='ai_generated', linked back
 * via `regulation_id`.
 *
 * Re-runs are safe: skips regulations that already have ai_generated FAQs.
 * Pass `--force` to regenerate (deletes existing ai_generated drafts first).
 *
 * Rate limit: Groq free tier is 8k TPM. We sequentialize calls with a small
 * delay between them (CLAUDE.md gotcha #5).
 *
 * Usage:
 *   npm run generate:faqs           # generate for all playbook rows missing AI FAQs
 *   npm run generate:faqs -- --force      # regenerate everything
 *   npm run generate:faqs -- --limit 3    # smoke test: 3 rows only
 */

import { sql } from "drizzle-orm";
import Groq from "groq-sdk";
import { db } from "@/lib/db";

const MODEL = "openai/gpt-oss-20b";
const PER_CALL_DELAY_MS = 1500;
const MIN_BODY_LEN = 200;
const TARGET_FAQ_COUNT = "3-5";

interface CliFlags {
  force: boolean;
  limit: number | null;
}

function parseFlags(): CliFlags {
  const argv = process.argv.slice(2);
  let force = false;
  let limit: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--force") force = true;
    else if (argv[i] === "--limit") {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = n;
      i += 1;
    }
  }
  return { force, limit };
}

interface PlaybookRow extends Record<string, unknown> {
  id: number;
  playbook_slug: string;
  title_th: string;
  title_en: string | null;
  body_th: string | null;
  body_en: string | null;
}

interface GeneratedFaq {
  question_th: string;
  question_en: string;
  answer_th: string;
  answer_en: string;
  topic: string;
}

const FAQ_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    faqs: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question_th: {
            type: "string",
            description:
              "The question in Thai, phrased the way a lawyer or compliance officer at SCG would actually search for it.",
          },
          question_en: {
            type: "string",
            description: "Same question, in clear English.",
          },
          answer_th: {
            type: "string",
            description:
              "Answer in Thai, grounded ONLY in the playbook content provided. Cite the law section (e.g. มาตรา 103) when relevant. Concise: 2-5 sentences.",
          },
          answer_en: {
            type: "string",
            description: "Same answer in English.",
          },
          topic: {
            type: "string",
            description:
              "Single-word lowercase topic tag (e.g. 'voting', 'quorum', 'notice', 'proxy', 'dividend', 'auditor', 'pdpa').",
          },
        },
        required: ["question_th", "question_en", "answer_th", "answer_en", "topic"],
      },
    },
  },
  required: ["faqs"],
} as const;

function buildPrompt(row: PlaybookRow): string {
  const titleLine = row.title_en
    ? `${row.title_th} / ${row.title_en}`
    : row.title_th;

  // Prefer Thai body (source of truth for SCG Legal) but include English for context
  const content = [row.body_th, row.body_en].filter(Boolean).join("\n\n---\n\n");

  return `You are a senior legal compliance assistant for SCG Legal (Thailand). \
Your task is to generate ${TARGET_FAQ_COUNT} high-quality FAQ pairs from the \
following internal compliance playbook section. The audience is lawyers and \
compliance officers at SCG, often working on Annual General Meeting (AGM) \
procedures for SET-listed companies.

SECTION TITLE
${titleLine}

PLAYBOOK CONTENT (the only source of truth — do not invent facts beyond this)
\`\`\`
${content}
\`\`\`

REQUIREMENTS
- Generate questions a real lawyer would search for, not generic textbook questions.
- Answers must be grounded EXCLUSIVELY in the playbook content above. If something \
isn't in the content, don't include it as a question.
- Cite specific Thai law sections (e.g. "มาตรา 103 พ.ร.บ.บริษัทมหาชนฯ") when the \
playbook mentions them.
- Keep answers to 2-5 sentences. Prefer specifics (numbers, percentages, deadlines) over generalities.
- Output BOTH Thai and English for every Q and A. Translations must preserve legal precision.
- Pick a single-word lowercase topic tag per FAQ.

Return JSON conforming to the schema.`;
}

async function fetchEligibleRows(force: boolean, limit: number | null): Promise<PlaybookRow[]> {
  // Rows that have substantive content AND (force OR no existing ai_generated faq)
  const limitClause = limit ? sql`LIMIT ${limit}` : sql``;
  const result = await db.execute<PlaybookRow>(sql`
    SELECT r.id, r.playbook_slug, r.title_th, r.title_en, r.body_th, r.body_en
    FROM regulations r
    WHERE r.source_type = 'internal_playbook'
      AND length(coalesce(r.body_th, '') || coalesce(r.body_en, '')) >= ${MIN_BODY_LEN}
      AND (
        ${force}
        OR NOT EXISTS (
          SELECT 1 FROM faqs f
          WHERE f.regulation_id = r.id AND f.source = 'ai_generated'
        )
      )
    ORDER BY r.playbook_slug
    ${limitClause}
  `);
  return result.rows;
}

async function deleteExistingAiFaqs(regulationId: number) {
  await db.execute(sql`
    DELETE FROM faqs
    WHERE regulation_id = ${regulationId} AND source = 'ai_generated'
  `);
}

async function insertFaqs(
  regulationId: number,
  topicFallback: string,
  faqs: GeneratedFaq[]
) {
  for (const f of faqs) {
    await db.execute(sql`
      INSERT INTO faqs (
        question_th, question_en, answer_th, answer_en,
        regulation_id, source, status, model, topic
      ) VALUES (
        ${f.question_th},
        ${f.question_en},
        ${f.answer_th},
        ${f.answer_en},
        ${regulationId},
        'ai_generated',
        'draft',
        ${MODEL},
        ${f.topic ?? topicFallback}
      )
    `);
  }
}

async function generateForRow(groq: Groq, row: PlaybookRow): Promise<GeneratedFaq[]> {
  const prompt = buildPrompt(row);
  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "faq_generation", schema: FAQ_JSON_SCHEMA, strict: true },
    },
    temperature: 0.3,
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("empty model response");
  const parsed = JSON.parse(content) as { faqs?: GeneratedFaq[] };
  if (!Array.isArray(parsed.faqs)) {
    throw new Error("malformed response: missing 'faqs' array");
  }
  return parsed.faqs;
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error(
      "[generate-faqs] GROQ_API_KEY not set. Add it to .env.local:\n" +
        "  GROQ_API_KEY=gsk_..."
    );
    process.exit(1);
  }

  const flags = parseFlags();
  const rows = await fetchEligibleRows(flags.force, flags.limit);
  console.log(
    `[generate-faqs] ${rows.length} playbook rows eligible · model=${MODEL} · force=${flags.force}`
  );
  if (rows.length === 0) {
    console.log(
      "[generate-faqs] nothing to do. " +
        "(All eligible rows already have AI FAQs. Pass --force to regenerate.)"
    );
    return;
  }

  const groq = new Groq({ apiKey });
  let totalFaqs = 0;
  let failures = 0;

  for (const [idx, row] of rows.entries()) {
    const tag = `[${idx + 1}/${rows.length}] ${row.playbook_slug}`;
    try {
      console.log(`${tag} generating…`);
      const faqs = await generateForRow(groq, row);
      if (flags.force) await deleteExistingAiFaqs(row.id);
      await insertFaqs(row.id, "general", faqs);
      totalFaqs += faqs.length;
      console.log(`${tag} ✓ ${faqs.length} FAQs saved`);
    } catch (err) {
      failures += 1;
      console.error(`${tag} ✗ ${(err as Error).message}`);
    }
    if (idx < rows.length - 1) await sleep(PER_CALL_DELAY_MS);
  }

  console.log(
    `[generate-faqs] done — ${totalFaqs} FAQs across ${rows.length - failures} rows · ${failures} failed`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[generate-faqs] fatal:", err);
    process.exit(1);
  });
