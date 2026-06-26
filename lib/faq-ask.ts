/**
 * AI-powered FAQ ask: given a question in Thai or English, retrieve candidate
 * FAQs + relevant playbook sections, then ask Groq to either point to an
 * existing matching FAQ or draft a new answer grounded in the playbook.
 *
 * The lawyer reviews the response on the client, then either:
 *   - Clicks through to the matched FAQ (no further action), or
 *   - Edits the draft and saves it as a new FAQ (status='draft', source='ai_generated')
 *
 * Strategy: lexical FTS for candidate retrieval (we don't have embeddings yet).
 * The model sees up to 8 FAQ candidates + 4 playbook sections to ground its
 * answer in. This keeps total prompt size manageable for the 8k Groq budget.
 */

import { sql } from "drizzle-orm";
import Groq from "groq-sdk";
import { db } from "./db";
import { containsThai } from "./utils";

const MODEL = "openai/gpt-oss-20b";
const FAQ_CANDIDATES = 8;
const REG_CANDIDATES = 4;

export type AskMatchType = "verified_faq" | "draft_faq" | "ai_suggestion" | "no_match";

export interface AskResponse {
  matchType: AskMatchType;
  matchedFaq: { id: number; questionEn: string | null; questionTh: string; answerEn: string | null; answerTh: string; status: string; topic: string | null } | null;
  suggestion: {
    questionTh: string;
    questionEn: string;
    answerTh: string;
    answerEn: string;
    topic: string;
    groundedInRegulationId: number | null;
    groundedInRegulationTitle: string | null;
  } | null;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  candidatesShown: { faqIds: number[]; regulationIds: number[] };
}

interface FaqCandidate extends Record<string, unknown> {
  id: number;
  question_en: string | null;
  question_th: string;
  answer_en: string | null;
  answer_th: string;
  status: string;
  topic: string | null;
}

interface RegulationCandidate extends Record<string, unknown> {
  id: number;
  title_th: string;
  title_en: string | null;
  body: string;
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    match_type: {
      type: "string",
      enum: ["verified_faq", "draft_faq", "ai_suggestion", "no_match"],
      description:
        "verified_faq = an existing verified FAQ answers it perfectly. draft_faq = an existing draft FAQ answers it (still useful). ai_suggestion = no existing FAQ matches, draft a new one grounded in the regulations. no_match = no relevant content found, decline.",
    },
    matched_faq_id: {
      type: ["integer", "null"],
      description: "Set ONLY if match_type is verified_faq or draft_faq.",
    },
    suggested_question_th: {
      type: ["string", "null"],
      description: "Set ONLY if match_type is ai_suggestion. The user's question rephrased cleanly in Thai.",
    },
    suggested_question_en: { type: ["string", "null"] },
    suggested_answer_th: {
      type: ["string", "null"],
      description: "Set ONLY if match_type is ai_suggestion. Grounded in the regulations provided. 2-5 sentences. Cite specific Thai law sections (มาตรา) when relevant.",
    },
    suggested_answer_en: { type: ["string", "null"] },
    suggested_topic: {
      type: ["string", "null"],
      description: "Single-word lowercase topic tag for the suggestion.",
    },
    grounded_in_regulation_id: {
      type: ["integer", "null"],
      description: "Set ONLY for ai_suggestion. The regulation_id that the answer is grounded in.",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reasoning: {
      type: "string",
      description: "One-sentence explanation: why this match, or why no match.",
    },
  },
  required: [
    "match_type",
    "matched_faq_id",
    "suggested_question_th",
    "suggested_question_en",
    "suggested_answer_th",
    "suggested_answer_en",
    "suggested_topic",
    "grounded_in_regulation_id",
    "confidence",
    "reasoning",
  ],
} as const;

async function retrieveFaqCandidates(question: string): Promise<FaqCandidate[]> {
  const isThai = containsThai(question);
  if (isThai) {
    const pattern = `%${question.slice(0, 60)}%`;
    // Trigram similarity for Thai
    const rows = await db.execute<FaqCandidate>(sql`
      SELECT
        id,
        question_en,
        question_th,
        answer_en,
        answer_th,
        status,
        topic
      FROM faqs
      WHERE
        question_th ILIKE ${pattern}
        OR answer_th ILIKE ${pattern}
        OR similarity(question_th, ${question}) > 0.15
      ORDER BY
        CASE status WHEN 'verified' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
        similarity(question_th, ${question}) DESC
      LIMIT ${FAQ_CANDIDATES}
    `);
    return rows.rows;
  }
  // English: tsquery
  const rows = await db.execute<FaqCandidate>(sql`
    SELECT
      id,
      question_en,
      question_th,
      answer_en,
      answer_th,
      status,
      topic,
      ts_rank(search_vector_en, websearch_to_tsquery('english', ${question})) AS rank
    FROM faqs
    WHERE search_vector_en @@ websearch_to_tsquery('english', ${question})
    ORDER BY
      CASE status WHEN 'verified' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      rank DESC
    LIMIT ${FAQ_CANDIDATES}
  `);
  return rows.rows;
}

async function retrieveRegulationCandidates(question: string): Promise<RegulationCandidate[]> {
  const isThai = containsThai(question);
  if (isThai) {
    const pattern = `%${question.slice(0, 60)}%`;
    const rows = await db.execute<RegulationCandidate>(sql`
      SELECT
        id,
        title_th,
        title_en,
        substring(coalesce(body_th, body_en, '') from 1 for 3000) AS body
      FROM regulations
      WHERE source_type IN ('internal_playbook', 'uploaded')
        AND (
          title_th ILIKE ${pattern}
          OR body_th ILIKE ${pattern}
          OR similarity(title_th, ${question}) > 0.15
        )
      ORDER BY similarity(title_th, ${question}) DESC, word_count DESC
      LIMIT ${REG_CANDIDATES}
    `);
    return rows.rows;
  }
  const rows = await db.execute<RegulationCandidate>(sql`
    SELECT
      id,
      title_th,
      title_en,
      substring(coalesce(body_en, body_th, '') from 1 for 3000) AS body,
      ts_rank(search_vector_en, websearch_to_tsquery('english', ${question})) AS rank
    FROM regulations
    WHERE source_type IN ('internal_playbook', 'uploaded')
      AND search_vector_en @@ websearch_to_tsquery('english', ${question})
    ORDER BY rank DESC, word_count DESC
    LIMIT ${REG_CANDIDATES}
  `);
  return rows.rows;
}

function buildPrompt(
  question: string,
  faqs: FaqCandidate[],
  regs: RegulationCandidate[]
): string {
  const faqBlock = faqs.length
    ? faqs
        .map(
          (f) =>
            `[FAQ #${f.id} status=${f.status} topic=${f.topic ?? "n/a"}]\n` +
            `Q (TH): ${f.question_th}\n` +
            (f.question_en ? `Q (EN): ${f.question_en}\n` : "") +
            `A (TH): ${f.answer_th}\n` +
            (f.answer_en ? `A (EN): ${f.answer_en}\n` : "")
        )
        .join("\n---\n")
    : "(no FAQ candidates found)";

  const regBlock = regs.length
    ? regs
        .map(
          (r) =>
            `[Regulation #${r.id}] ${r.title_th}${r.title_en ? ` / ${r.title_en}` : ""}\n` +
            `Body: ${r.body.slice(0, 1500)}${r.body.length > 1500 ? "…(truncated)" : ""}`
        )
        .join("\n---\n")
    : "(no regulation candidates found)";

  return `You are a senior legal compliance assistant for SCG Legal (Thailand). \
A user has asked the following question. Your job is to either:
  1. Identify an existing FAQ that already answers it (match_type = verified_faq or draft_faq), or
  2. Draft a new answer grounded in the provided regulations (match_type = ai_suggestion), or
  3. Decline if neither FAQs nor regulations cover this (match_type = no_match).

USER QUESTION
${question}

EXISTING FAQ CANDIDATES (top ${faqs.length} by lexical match)
${faqBlock}

RELEVANT REGULATIONS / PLAYBOOK SECTIONS (top ${regs.length} by lexical match)
${regBlock}

RULES
- Prefer verified_faq > draft_faq > ai_suggestion > no_match.
- An FAQ matches only if it directly addresses the user's question. Loose topical \
overlap is NOT a match — answer their actual question.
- For ai_suggestion, base the answer EXCLUSIVELY on the regulations above. Do not \
invent facts. Cite specific Thai law sections (e.g. มาตรา 103) when relevant. \
Keep answers to 2-5 sentences. Output BOTH Thai and English.
- For no_match, leave all suggested_* fields null and set confidence='low'.

Return JSON conforming to the schema.`;
}

export async function askFaq(question: string): Promise<AskResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const trimmed = question.trim();
  if (trimmed.length < 5) throw new Error("question too short");
  if (trimmed.length > 1000) throw new Error("question too long");

  const [faqs, regs] = await Promise.all([
    retrieveFaqCandidates(trimmed),
    retrieveRegulationCandidates(trimmed),
  ]);

  const groq = new Groq({ apiKey });
  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: buildPrompt(trimmed, faqs, regs) }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "faq_ask", schema: RESPONSE_SCHEMA, strict: true },
    },
    temperature: 0.2,
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("empty model response");
  const parsed = JSON.parse(content) as {
    match_type: AskMatchType;
    matched_faq_id: number | null;
    suggested_question_th: string | null;
    suggested_question_en: string | null;
    suggested_answer_th: string | null;
    suggested_answer_en: string | null;
    suggested_topic: string | null;
    grounded_in_regulation_id: number | null;
    confidence: "high" | "medium" | "low";
    reasoning: string;
  };

  let matchedFaq: AskResponse["matchedFaq"] = null;
  if (
    (parsed.match_type === "verified_faq" || parsed.match_type === "draft_faq") &&
    parsed.matched_faq_id != null
  ) {
    const found = faqs.find((f) => f.id === parsed.matched_faq_id);
    if (found) {
      matchedFaq = {
        id: found.id,
        questionEn: found.question_en,
        questionTh: found.question_th,
        answerEn: found.answer_en,
        answerTh: found.answer_th,
        status: found.status,
        topic: found.topic,
      };
    }
  }

  let suggestion: AskResponse["suggestion"] = null;
  if (
    parsed.match_type === "ai_suggestion" &&
    parsed.suggested_question_th &&
    parsed.suggested_answer_th
  ) {
    const groundedReg = parsed.grounded_in_regulation_id
      ? regs.find((r) => r.id === parsed.grounded_in_regulation_id)
      : null;
    suggestion = {
      questionTh: parsed.suggested_question_th,
      questionEn: parsed.suggested_question_en ?? parsed.suggested_question_th,
      answerTh: parsed.suggested_answer_th,
      answerEn: parsed.suggested_answer_en ?? parsed.suggested_answer_th,
      topic: parsed.suggested_topic ?? "general",
      groundedInRegulationId: parsed.grounded_in_regulation_id,
      groundedInRegulationTitle: groundedReg
        ? groundedReg.title_en ?? groundedReg.title_th
        : null,
    };
  }

  return {
    matchType: parsed.match_type,
    matchedFaq,
    suggestion,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    candidatesShown: {
      faqIds: faqs.map((f) => f.id),
      regulationIds: regs.map((r) => r.id),
    },
  };
}

/**
 * Promote an AI suggestion to a real draft FAQ in the corpus. Returns the new
 * FAQ id so the caller can route to /faq/[id] for further review.
 */
export async function saveSuggestionAsDraft(suggestion: {
  questionTh: string;
  questionEn: string;
  answerTh: string;
  answerEn: string;
  topic: string;
  groundedInRegulationId: number | null;
}): Promise<number> {
  const inserted = await db.execute<{ id: number }>(sql`
    INSERT INTO faqs (
      question_th, question_en, answer_th, answer_en,
      regulation_id, source, status, model, topic
    ) VALUES (
      ${suggestion.questionTh},
      ${suggestion.questionEn},
      ${suggestion.answerTh},
      ${suggestion.answerEn},
      ${suggestion.groundedInRegulationId},
      'ai_generated',
      'draft',
      ${MODEL},
      ${suggestion.topic}
    )
    RETURNING id
  `);
  return inserted.rows[0]!.id;
}
