/**
 * Shared FAQ generation logic — used by both the batch script
 * (`scripts/generate-faqs.ts`) and the upload-time generation path
 * (`app/api/upload/route.ts`).
 *
 * Wraps Groq's `openai/gpt-oss-20b` (which supports json_schema per CLAUDE.md
 * gotcha #4) and the resulting INSERT into the `faqs` table.
 */

import { sql } from "drizzle-orm";
import Groq from "groq-sdk";
import { db } from "./db";
import { storeFaqEmbedding, faqEmbeddingText } from "./embeddings";

const MODEL = "openai/gpt-oss-20b";

export interface SourceForGeneration {
  /** The regulations row this content came from. New FAQs link back via this. */
  regulationId: number;
  titleTh: string;
  titleEn: string | null;
  bodyTh: string | null;
  bodyEn: string | null;
  /**
   * Optional: email of the lawyer to assign these draft FAQs to for verification.
   * Surfaced on the FAQ list/detail and used by the "assigned to me" filter.
   */
  assignedTo?: string | null;
}

export interface GeneratedFaqRecord {
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
          question_en: { type: "string", description: "Same question in clear English." },
          answer_th: {
            type: "string",
            description:
              "Answer in Thai, grounded ONLY in the source content. Cite specific law sections (e.g. มาตรา 103) when relevant. 2-5 sentences.",
          },
          answer_en: { type: "string", description: "Same answer in English." },
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

function buildPrompt(src: SourceForGeneration): string {
  const titleLine = src.titleEn ? `${src.titleTh} / ${src.titleEn}` : src.titleTh;
  const content = [src.bodyTh, src.bodyEn].filter(Boolean).join("\n\n---\n\n");

  return `You are a senior legal compliance assistant for SCG Legal (Thailand). \
Your task is to generate 3-5 high-quality FAQ pairs from the following \
internal source document. The audience is lawyers and compliance officers \
at SCG, working on Thai corporate compliance for SET-listed companies.

SOURCE TITLE
${titleLine}

SOURCE CONTENT (the only source of truth — do not invent facts beyond this)
\`\`\`
${content}
\`\`\`

REQUIREMENTS
- Generate questions a real lawyer would search for, not generic textbook ones.
- Answers must be grounded EXCLUSIVELY in the source content above. If something \
isn't in the content, don't include it as a question.
- Cite specific Thai law sections (e.g. "มาตรา 103 พ.ร.บ.บริษัทมหาชนฯ") when the \
source mentions them.
- Keep answers to 2-5 sentences. Prefer specifics over generalities.
- Output BOTH Thai and English for every Q and A.
- Pick a single-word lowercase topic tag per FAQ.

Return JSON conforming to the schema.`;
}

export interface GenerateAndSaveResult {
  count: number;
  faqIds: number[];
}

/**
 * Generate FAQs for a source regulation, save them as `status='draft'`
 * `source='ai_generated'` rows linked via `regulation_id`. Returns the new
 * FAQ ids so the caller can redirect or display them immediately.
 *
 * Throws if GROQ_API_KEY is missing or the model response is malformed.
 */
export async function generateAndSaveFaqs(
  src: SourceForGeneration
): Promise<GenerateAndSaveResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }
  const groq = new Groq({ apiKey });

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: buildPrompt(src) }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "faq_generation", schema: FAQ_JSON_SCHEMA, strict: true },
    },
    temperature: 0.3,
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("empty model response");
  const parsed = JSON.parse(content) as { faqs?: GeneratedFaqRecord[] };
  if (!Array.isArray(parsed.faqs)) {
    throw new Error("malformed response: missing 'faqs' array");
  }

  const assignedTo = src.assignedTo?.trim() || null;
  const faqIds: number[] = [];
  for (const f of parsed.faqs) {
    const result = await db.execute<{ id: number }>(sql`
      INSERT INTO faqs (
        question_th, question_en, answer_th, answer_en,
        regulation_id, source, status, model, topic, assigned_to
      ) VALUES (
        ${f.question_th},
        ${f.question_en},
        ${f.answer_th},
        ${f.answer_en},
        ${src.regulationId},
        'ai_generated',
        'draft',
        ${MODEL},
        ${f.topic},
        ${assignedTo}
      )
      RETURNING id
    `);
    const id = result.rows[0]?.id;
    if (id) {
      faqIds.push(id);
      // Best-effort embed for vector search. Failures are swallowed inside
      // storeFaqEmbedding — backfill script can pick up missed rows later.
      await storeFaqEmbedding(
        id,
        faqEmbeddingText({
          questionTh: f.question_th,
          questionEn: f.question_en,
          answerTh: f.answer_th,
          answerEn: f.answer_en,
        })
      );
    }
  }
  return { count: faqIds.length, faqIds };
}
