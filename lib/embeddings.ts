/**
 * Embedding helpers for vector search.
 *
 * Uses Vercel AI Gateway via the `ai` SDK with the OpenAI text-embedding-3-small
 * model (1536 dims). On Vercel runtime, the gateway routes automatically via
 * VERCEL_OIDC_TOKEN; locally you need AI_GATEWAY_API_KEY in .env.local.
 *
 * All calls swallow errors and return null — embeddings are a nice-to-have
 * layer over lexical search, not a hard dependency. Backfill picks up missed
 * rows separately.
 */

import { embed } from "ai";
import { sql } from "drizzle-orm";
import { db } from "./db";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const MAX_INPUT_CHARS = 8000; // ~2000 tokens, well under model's 8192 limit

/**
 * Generate an embedding for the given text. Returns null on any error
 * (missing API key, rate limit, network) so callers can degrade gracefully.
 */
export async function tryEmbed(text: string): Promise<number[] | null> {
  if (!text || !text.trim()) return null;
  // Auth: AI Gateway needs either AI_GATEWAY_API_KEY (local) or VERCEL_OIDC_TOKEN
  // (runtime). CLAUDE.md gotcha #6: don't trust .env.local OIDC presence alone.
  const hasKey =
    !!process.env.AI_GATEWAY_API_KEY || process.env.VERCEL === "1";
  if (!hasKey) return null;
  try {
    const { embedding } = await embed({
      model: EMBEDDING_MODEL,
      value: text.slice(0, MAX_INPUT_CHARS),
    });
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
      console.warn(
        `[embeddings] unexpected embedding length: ${embedding?.length}`
      );
      return null;
    }
    return embedding;
  } catch (err) {
    console.warn(`[embeddings] embed failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Format a JS number[] as a pgvector literal: "[0.1,0.2,...]"
 */
export function vectorToSql(vec: number[]): string {
  return `[${vec.map((n) => n.toFixed(7)).join(",")}]`;
}

/**
 * Persist an embedding to faqs.embedding for a given id. Best-effort — logs
 * on failure but doesn't throw.
 */
export async function storeFaqEmbedding(
  faqId: number,
  text: string
): Promise<boolean> {
  const vec = await tryEmbed(text);
  if (!vec) return false;
  const lit = vectorToSql(vec);
  try {
    await db.execute(sql`
      UPDATE faqs SET embedding = ${lit}::vector WHERE id = ${faqId}
    `);
    return true;
  } catch (err) {
    console.warn(`[embeddings] store faq ${faqId} failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Same as storeFaqEmbedding for regulations.
 */
export async function storeRegulationEmbedding(
  regulationId: number,
  text: string
): Promise<boolean> {
  const vec = await tryEmbed(text);
  if (!vec) return false;
  const lit = vectorToSql(vec);
  try {
    await db.execute(sql`
      UPDATE regulations SET embedding = ${lit}::vector WHERE id = ${regulationId}
    `);
    return true;
  } catch (err) {
    console.warn(
      `[embeddings] store regulation ${regulationId} failed: ${(err as Error).message}`
    );
    return false;
  }
}

/**
 * Compose the canonical embedding text for an FAQ: question + answer in both
 * languages joined, so search matches against any of them.
 */
export function faqEmbeddingText(faq: {
  questionTh?: string | null;
  questionEn?: string | null;
  answerTh?: string | null;
  answerEn?: string | null;
}): string {
  return [faq.questionTh, faq.questionEn, faq.answerTh, faq.answerEn]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Canonical embedding text for a regulation: title + body (bilingual).
 */
export function regulationEmbeddingText(reg: {
  titleTh?: string | null;
  titleEn?: string | null;
  bodyTh?: string | null;
  bodyEn?: string | null;
}): string {
  return [reg.titleTh, reg.titleEn, reg.bodyTh, reg.bodyEn]
    .filter(Boolean)
    .join("\n\n");
}
