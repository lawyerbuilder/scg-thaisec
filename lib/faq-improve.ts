/**
 * AI-assisted FAQ improvement: takes an existing FAQ and its source regulation,
 * asks Groq to rewrite the question and answer for clarity, precision, and
 * accuracy. The lawyer reviews the suggestion on the client and chooses to
 * apply or dismiss.
 *
 * Grounding: only the source regulation. The model must NOT invent new facts
 * beyond what the regulation supports.
 */

import { sql } from "drizzle-orm";
import Groq from "groq-sdk";
import { db } from "./db";

const MODEL = "openai/gpt-oss-20b";

export interface ImprovementRequest {
  faqId: number;
  currentQuestionTh: string;
  currentQuestionEn: string | null;
  currentAnswerTh: string;
  currentAnswerEn: string | null;
  /**
   * Optional free-text instruction from the lawyer — what THEY want the AI
   * to change. e.g. "make it shorter", "add a quorum example", "translate
   * more formally", "cite มาตรา 100". The model treats this as a strong
   * directive, but still grounded only in the source regulation.
   */
  userInstruction?: string | null;
}

/**
 * Fallback model list — try in order. The first model is the cheapest and
 * usually correct; later models are slower or pricier but more reliable for
 * structured JSON output. CLAUDE.md gotcha #4: only models on this list
 * support response_format=json_schema on Groq.
 */
const FALLBACK_MODELS = [
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];

const MAX_ATTEMPTS = 3;

export interface ImprovementResponse {
  improvedQuestionTh: string;
  improvedQuestionEn: string;
  improvedAnswerTh: string;
  improvedAnswerEn: string;
  improvementsMade: string[];
  confidence: "high" | "medium" | "low";
  warnings: string[];
  groundedInRegulationId: number | null;
  groundedInRegulationTitle: string | null;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    improved_question_th: {
      type: "string",
      description: "Clearer, more searchable version of the question in Thai.",
    },
    improved_question_en: {
      type: "string",
      description: "Same question, clear English.",
    },
    improved_answer_th: {
      type: "string",
      description:
        "Improved Thai answer. Grounded ONLY in the source regulation. Cite specific มาตรา when the regulation supports them. 2-5 sentences. Prefer specifics over generalities.",
    },
    improved_answer_en: {
      type: "string",
      description: "Same answer in English.",
    },
    improvements_made: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 6,
      description:
        "Short bullet points describing what you changed and why (e.g., 'Added citation to มาตรา 103', 'Rephrased question for clarity', 'Removed unsupported claim about board composition').",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    warnings: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
      description:
        "Optional flags for the reviewer — e.g., 'Source regulation does not address the question fully; consider broader sources', or 'The original answer contained a likely factual error'.",
    },
  },
  required: [
    "improved_question_th",
    "improved_question_en",
    "improved_answer_th",
    "improved_answer_en",
    "improvements_made",
    "confidence",
    "warnings",
  ],
} as const;

interface RegulationRow extends Record<string, unknown> {
  id: number;
  title_th: string;
  title_en: string | null;
  body_th: string | null;
  body_en: string | null;
}

async function fetchSourceRegulation(faqId: number): Promise<RegulationRow | null> {
  const rows = await db.execute<RegulationRow>(sql`
    SELECT
      r.id,
      r.title_th,
      r.title_en,
      r.body_th,
      r.body_en
    FROM faqs f
    LEFT JOIN regulations r ON r.id = f.regulation_id
    WHERE f.id = ${faqId} AND r.id IS NOT NULL
    LIMIT 1
  `);
  return rows.rows[0] ?? null;
}

function buildPrompt(req: ImprovementRequest, reg: RegulationRow | null): string {
  const regBlock = reg
    ? `SOURCE REGULATION (#${reg.id})
Title: ${reg.title_th}${reg.title_en ? ` / ${reg.title_en}` : ""}

Body (truncated to 4000 chars):
\`\`\`
${[reg.body_th, reg.body_en].filter(Boolean).join("\n\n---\n\n").slice(0, 4000)}
\`\`\``
    : `(No source regulation linked. Work only from the current FAQ text — flag this in 'warnings'.)`;

  const instructionBlock = req.userInstruction?.trim()
    ? `\n\nLAWYER'S SPECIFIC INSTRUCTION (treat as a strong directive):
"${req.userInstruction.trim()}"

Take this instruction seriously — it's what the lawyer actually wants changed. \
But still stay grounded ONLY in the source regulation; don't invent facts to satisfy the instruction.\n`
    : "";

  return `You are a senior legal compliance editor for SCG Legal (Thailand). \
A lawyer is reviewing the draft FAQ below and wants your help improving it. \
Your job: rewrite the question and answer to be CLEARER, MORE PRECISE, and \
BETTER GROUNDED, without changing the underlying legal substance.

CURRENT DRAFT
Question (TH): ${req.currentQuestionTh}
${req.currentQuestionEn ? `Question (EN): ${req.currentQuestionEn}` : ""}
Answer (TH):
${req.currentAnswerTh}
${req.currentAnswerEn ? `\nAnswer (EN):\n${req.currentAnswerEn}` : ""}

${regBlock}${instructionBlock}

RULES
- Stay grounded EXCLUSIVELY in the source regulation. Do not introduce facts that aren't in the regulation.
- Cite specific Thai law sections (e.g. "มาตรา 103 พ.ร.บ.บริษัทมหาชนฯ") when the regulation contains them.
- Keep answers concise: 2-5 sentences. Prefer specific numbers/dates/percentages over generalities.
- Output BOTH Thai and English for question and answer. Translations must preserve legal precision.
- 'improvements_made' must accurately describe what you changed. Do not invent improvements.
- If the source regulation doesn't actually cover the question well, raise that in 'warnings' with confidence='low' — don't pretend to answer.

CRITICAL — JSON OUTPUT FORMAT
You MUST return strictly valid JSON conforming to the schema. Do NOT add extra \
fields, trailing commas, comments, or text outside the JSON object. Each array \
must be properly closed before the next field begins.`;
}

interface ParsedImprovement {
  improved_question_th: string;
  improved_question_en: string;
  improved_answer_th: string;
  improved_answer_en: string;
  improvements_made: string[];
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export async function improveFaq(req: ImprovementRequest): Promise<ImprovementResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const reg = await fetchSourceRegulation(req.faqId);
  const groq = new Groq({ apiKey });
  const prompt = buildPrompt(req, reg);

  // Retry loop. gpt-oss-20b occasionally emits malformed JSON even in strict
  // mode (extra elements after a closed array, trailing commas, etc.). On
  // each retry we lower temperature and, after the first model fails, swap
  // to the more reliable fallback model.
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = attempt === 0 ? FALLBACK_MODELS[0] : FALLBACK_MODELS[1] ?? FALLBACK_MODELS[0];
    const temperature = Math.max(0.0, 0.2 - attempt * 0.1);
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "faq_improve", schema: SCHEMA, strict: true },
        },
        temperature,
        max_tokens: 1800,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("empty model response");
      const parsed = JSON.parse(content) as ParsedImprovement;
      return {
        improvedQuestionTh: parsed.improved_question_th,
        improvedQuestionEn: parsed.improved_question_en,
        improvedAnswerTh: parsed.improved_answer_th,
        improvedAnswerEn: parsed.improved_answer_en,
        improvementsMade: Array.isArray(parsed.improvements_made) ? parsed.improvements_made : [],
        confidence: parsed.confidence ?? "medium",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        groundedInRegulationId: reg?.id ?? null,
        groundedInRegulationTitle: reg ? reg.title_en ?? reg.title_th : null,
      };
    } catch (err) {
      lastError = err as Error;
      console.warn(
        `[faq-improve] attempt ${attempt + 1}/${MAX_ATTEMPTS} failed on ${model}: ${lastError.message}`
      );
    }
  }
  throw new Error(
    `AI improvement failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastError?.message ?? "unknown"}`
  );
}
