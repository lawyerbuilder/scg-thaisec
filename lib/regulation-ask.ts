/**
 * AI-powered regulation search.
 *
 * Same pattern as lib/faq-ask.ts but searches the `regulations` table
 * (AGM playbook + SEC NRS + uploaded docs) instead of `faqs`. Returns
 * either a synthesized answer with citations to the relevant regulations,
 * or — if no relevant content is found — a clean "I don't know" so the
 * user knows the corpus doesn't cover this question.
 *
 * Retrieval: hybrid vector + lexical, top-8 candidates → Groq summarizes
 * grounded only in the retrieved text.
 */

import { sql } from "drizzle-orm";
import Groq from "groq-sdk";
import { db } from "./db";
import { containsThai } from "./utils";
import { tryEmbed, vectorToSql } from "./embeddings";

const MODEL = "openai/gpt-oss-20b";
const FALLBACK_MODELS = [
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];
const MAX_ATTEMPTS = 3;
const REG_CANDIDATES = 8;
const BODY_CHARS_PER_CANDIDATE = 2500;

export interface RegulationAnswer {
  hasAnswer: boolean;
  answer: string;
  citations: Array<{
    id: number;
    titleEn: string | null;
    titleTh: string;
    regulationTypeName: string | null;
    regNumber: string | null;
  }>;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

interface Candidate extends Record<string, unknown> {
  id: number;
  title_th: string;
  title_en: string | null;
  reg_number: string | null;
  regulation_type_name: string | null;
  body: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    has_answer: {
      type: "boolean",
      description:
        "True if the candidates contain information that actually answers the question. False otherwise — DO NOT fabricate.",
    },
    answer: {
      type: "string",
      description:
        "When has_answer=true: a clear, concise answer in the user's language (Thai if the question was Thai, English otherwise). 2-5 sentences. When has_answer=false: a brief acknowledgment + suggestion to try different keywords.",
    },
    citation_ids: {
      type: "array",
      items: { type: "integer" },
      description:
        "When has_answer=true: the IDs of the candidate regulations actually used in the answer. Empty array when has_answer=false.",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reasoning: {
      type: "string",
      description:
        "One sentence: why this answer / why no answer was possible from the candidates.",
    },
  },
  required: ["has_answer", "answer", "citation_ids", "confidence", "reasoning"],
} as const;

async function retrieveCandidates(
  question: string,
  embedding: number[] | null
): Promise<Candidate[]> {
  const isThai = containsThai(question);

  if (embedding) {
    const vecLit = vectorToSql(embedding);
    const rows = await db.execute<Candidate>(sql`
      WITH vec AS (
        SELECT id, (1 - (embedding <=> ${vecLit}::vector)) AS sim
        FROM regulations
        WHERE embedding IS NOT NULL
          AND length(coalesce(body_th, '') || coalesce(body_en, '')) >= 100
        ORDER BY embedding <=> ${vecLit}::vector
        LIMIT 30
      ),
      lex AS (
        SELECT id, ${isThai
          ? sql`similarity(coalesce(title_th, ''), ${question})`
          : sql`coalesce(ts_rank(search_vector_en, websearch_to_tsquery('english', ${question})), 0)`
        } AS lex_score
        FROM regulations
        WHERE ${isThai
          ? sql`coalesce(title_th, '') ILIKE ${"%" + question.slice(0, 60) + "%"}
              OR similarity(coalesce(title_th, ''), ${question}) > 0.1
              OR coalesce(body_th, '') ILIKE ${"%" + question.slice(0, 60) + "%"}`
          : sql`search_vector_en @@ websearch_to_tsquery('english', ${question})`}
        ORDER BY lex_score DESC LIMIT 30
      ),
      merged AS (
        SELECT r.id, coalesce(v.sim, 0) AS sim, coalesce(l.lex_score, 0) AS lex_score
        FROM regulations r
        LEFT JOIN vec v ON v.id = r.id
        LEFT JOIN lex l ON l.id = r.id
        WHERE v.id IS NOT NULL OR l.id IS NOT NULL
      )
      SELECT
        r.id,
        r.title_th,
        r.title_en,
        r.reg_number,
        rt.name_en AS regulation_type_name,
        substring(coalesce(${isThai ? sql`r.body_th, r.body_en` : sql`r.body_en, r.body_th`}, '') from 1 for ${BODY_CHARS_PER_CANDIDATE}) AS body,
        (0.6 * m.sim + 0.4 * m.lex_score) AS combined_score
      FROM regulations r
      JOIN merged m ON m.id = r.id
      LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
      WHERE length(coalesce(r.body_th, '') || coalesce(r.body_en, '')) >= 100
      ORDER BY combined_score DESC
      LIMIT ${REG_CANDIDATES}
    `);
    return rows.rows;
  }

  // Lexical-only fallback
  const pattern = `%${question.slice(0, 60)}%`;
  const rows = await db.execute<Candidate>(sql`
    SELECT r.id, r.title_th, r.title_en, r.reg_number,
           rt.name_en AS regulation_type_name,
           substring(coalesce(${isThai ? sql`r.body_th, r.body_en` : sql`r.body_en, r.body_th`}, '') from 1 for ${BODY_CHARS_PER_CANDIDATE}) AS body
    FROM regulations r
    LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
    WHERE length(coalesce(r.body_th, '') || coalesce(r.body_en, '')) >= 100
      AND (title_th ILIKE ${pattern} OR body_th ILIKE ${pattern} OR title_en ILIKE ${pattern} OR body_en ILIKE ${pattern})
    LIMIT ${REG_CANDIDATES}
  `);
  return rows.rows;
}

function buildPrompt(question: string, candidates: Candidate[]): string {
  const block = candidates
    .map(
      (c, i) =>
        `[#${i + 1} · id=${c.id}] ${c.regulation_type_name ?? "Regulation"}${c.reg_number ? ` ${c.reg_number}` : ""}
Title (Thai): ${c.title_th}
${c.title_en ? `Title (EN): ${c.title_en}` : ""}
Body excerpt:
${c.body.slice(0, BODY_CHARS_PER_CANDIDATE)}`
    )
    .join("\n\n---\n\n");

  return `You are a Thai capital-markets compliance assistant for SCG Legal. A lawyer or compliance officer is asking the following question:

QUESTION
${question}

CANDIDATE REGULATIONS (top ${candidates.length} matches from the corpus)
${block}

YOUR TASK
1. Decide whether the candidates actually contain content that answers this question (set has_answer accordingly). Default to has_answer=false when uncertain — false-positive answers are worse than honest "I don't know".
2. If has_answer=true: synthesize a 2-5 sentence answer in the same language the user asked in. Cite specific regulation IDs (the [#N · id=X] markers above) in citation_ids. Quote specific section numbers (e.g. "มาตรา 103") where the regulation contains them.
3. If has_answer=false: say so clearly. Suggest the user try different keywords or upload a relevant source document. Empty citation_ids.

RULES
- Answer EXCLUSIVELY from the candidate text above. Do not invent facts.
- Do not cite a regulation you didn't actually use. Citations must be sourced from the candidate text.
- Match the user's language. Thai question → Thai answer. English question → English answer.

Return JSON conforming to the schema.`;
}

export async function askRegulations(question: string): Promise<RegulationAnswer> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const trimmed = question.trim();
  if (trimmed.length < 5) throw new Error("question too short");
  if (trimmed.length > 1000) throw new Error("question too long");

  const embedding = await tryEmbed(trimmed);
  const candidates = await retrieveCandidates(trimmed, embedding);

  if (candidates.length === 0) {
    return {
      hasAnswer: false,
      answer:
        "I couldn't find any regulations matching that question. Try different keywords, or upload a relevant source document via the FAQ generator.",
      citations: [],
      confidence: "low",
      reasoning: "No candidates retrieved from corpus.",
    };
  }

  const groq = new Groq({ apiKey });
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = attempt === 0 ? FALLBACK_MODELS[0] : FALLBACK_MODELS[1] ?? FALLBACK_MODELS[0];
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: buildPrompt(trimmed, candidates) }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "reg_ask", schema: SCHEMA, strict: true },
        },
        temperature: Math.max(0, 0.2 - attempt * 0.1),
        max_tokens: 1500,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("empty response");
      const parsed = JSON.parse(content) as {
        has_answer: boolean;
        answer: string;
        citation_ids: number[];
        confidence: "high" | "medium" | "low";
        reasoning: string;
      };
      const cited = parsed.citation_ids
        .map((id) => candidates.find((c) => c.id === id))
        .filter(Boolean)
        .map((c) => ({
          id: c!.id,
          titleEn: c!.title_en,
          titleTh: c!.title_th,
          regulationTypeName: c!.regulation_type_name,
          regNumber: c!.reg_number,
        }));
      return {
        hasAnswer: parsed.has_answer,
        answer: parsed.answer,
        citations: cited,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      lastError = err as Error;
      console.warn(
        `[regulation-ask] attempt ${attempt + 1}/${MAX_ATTEMPTS} on ${model}: ${lastError.message.slice(0, 120)}`
      );
    }
  }
  throw new Error(
    `Regulation ask failed after ${MAX_ATTEMPTS} attempts. Last: ${lastError?.message}`
  );
}
