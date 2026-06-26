import { sql } from "drizzle-orm";
import { db } from "./db";
import { containsThai } from "./utils";

// --------------------------------------------------------------------------
// Row shapes for the FAQ UI.
// --------------------------------------------------------------------------

export interface FaqListRow {
  id: number;
  questionTh: string;
  questionEn: string | null;
  answerTh: string;
  answerEn: string | null;
  topic: string | null;
  status: "draft" | "verified" | "rejected";
  source: "imported" | "ai_generated" | "manual";
  regulationId: number | null;
  regulationTitleTh: string | null;
  regulationTitleEn: string | null;
  regulationPlaybookSlug: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rank: number;
}

export interface FaqDetail extends FaqListRow {
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FaqListOptions {
  query?: string;
  status?: "draft" | "verified" | "rejected" | "all";
  topic?: string;
  source?: "imported" | "ai_generated" | "manual" | "all";
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;

export async function listFaqs(opts: FaqListOptions = {}): Promise<FaqListRow[]> {
  const { query, status = "all", topic, source = "all", limit = DEFAULT_LIMIT, offset = 0 } = opts;

  const statusFilter = status === "all" ? sql`` : sql`AND f.status = ${status}`;
  const topicFilter = topic ? sql`AND f.topic = ${topic}` : sql``;
  const sourceFilter = source === "all" ? sql`` : sql`AND f.source = ${source}`;

  let searchClause = sql``;
  let rankExpr = sql`0::real`;

  if (query?.trim()) {
    const q = query.trim();
    if (containsThai(q)) {
      const pattern = `%${q}%`;
      searchClause = sql`AND (
        f.question_th ILIKE ${pattern}
        OR f.answer_th ILIKE ${pattern}
        OR f.question_en ILIKE ${pattern}
        OR f.answer_en ILIKE ${pattern}
      )`;
      rankExpr = sql`similarity(f.question_th, ${q}) + similarity(coalesce(f.answer_th, ''), ${q})`;
    } else {
      // English: use websearch_to_tsquery for natural query input
      searchClause = sql`AND f.search_vector_en @@ websearch_to_tsquery('english', ${q})`;
      rankExpr = sql`ts_rank(f.search_vector_en, websearch_to_tsquery('english', ${q}))`;
    }
  }

  const rows = await db.execute(sql`
    SELECT
      f.id,
      f.question_th AS "questionTh",
      f.question_en AS "questionEn",
      f.answer_th AS "answerTh",
      f.answer_en AS "answerEn",
      f.topic,
      f.status,
      f.source,
      f.regulation_id AS "regulationId",
      r.title_th AS "regulationTitleTh",
      r.title_en AS "regulationTitleEn",
      r.playbook_slug AS "regulationPlaybookSlug",
      to_char(f.verified_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "verifiedAt",
      f.verified_by AS "verifiedBy",
      (${rankExpr})::real AS rank
    FROM faqs f
    LEFT JOIN regulations r ON r.id = f.regulation_id
    WHERE 1=1
      ${statusFilter}
      ${topicFilter}
      ${sourceFilter}
      ${searchClause}
    ORDER BY
      CASE f.status WHEN 'verified' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      rank DESC,
      f.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);
  return rows.rows as unknown as FaqListRow[];
}

export async function getFaqById(id: number): Promise<FaqDetail | null> {
  const rows = await db.execute(sql`
    SELECT
      f.id,
      f.question_th AS "questionTh",
      f.question_en AS "questionEn",
      f.answer_th AS "answerTh",
      f.answer_en AS "answerEn",
      f.topic,
      f.status,
      f.source,
      f.model,
      f.regulation_id AS "regulationId",
      r.title_th AS "regulationTitleTh",
      r.title_en AS "regulationTitleEn",
      r.playbook_slug AS "regulationPlaybookSlug",
      to_char(f.verified_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "verifiedAt",
      f.verified_by AS "verifiedBy",
      to_char(f.created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "createdAt",
      to_char(f.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "updatedAt",
      0::real AS rank
    FROM faqs f
    LEFT JOIN regulations r ON r.id = f.regulation_id
    WHERE f.id = ${id}
    LIMIT 1
  `);
  return (rows.rows[0] as unknown as FaqDetail) ?? null;
}

export async function countFaqs(opts: Pick<FaqListOptions, "status"> = {}): Promise<number> {
  const { status = "all" } = opts;
  const statusFilter = status === "all" ? sql`` : sql`WHERE status = ${status}`;
  const rows = await db.execute(sql`
    SELECT count(*)::int AS n FROM faqs ${statusFilter}
  `);
  return (rows.rows[0] as { n: number })?.n ?? 0;
}

export async function listFaqTopics(): Promise<{ topic: string; count: number }[]> {
  const rows = await db.execute(sql`
    SELECT topic, count(*)::int AS count
    FROM faqs
    WHERE topic IS NOT NULL
    GROUP BY topic
    ORDER BY count DESC, topic ASC
  `);
  return rows.rows as unknown as { topic: string; count: number }[];
}

// --------------------------------------------------------------------------
// Mutations — used by the verify/edit flow.
// NOTE: AUTH IS NOT WIRED YET. These accept a `verifierEmail` string so the
// caller can pass a Clerk-authenticated email once Clerk is installed. For
// the MVP, the API routes that call these are unprotected — see TODO in
// app/api/faqs/[id]/route.ts.
// --------------------------------------------------------------------------

export async function verifyFaq(id: number, verifierEmail: string): Promise<FaqDetail | null> {
  await db.execute(sql`
    UPDATE faqs
    SET status = 'verified',
        verified_at = now(),
        verified_by = ${verifierEmail},
        updated_at = now()
    WHERE id = ${id}
  `);
  return getFaqById(id);
}

export async function rejectFaq(id: number, verifierEmail: string): Promise<FaqDetail | null> {
  await db.execute(sql`
    UPDATE faqs
    SET status = 'rejected',
        verified_at = now(),
        verified_by = ${verifierEmail},
        updated_at = now()
    WHERE id = ${id}
  `);
  return getFaqById(id);
}

export async function updateFaqContent(
  id: number,
  edits: {
    questionTh?: string;
    questionEn?: string | null;
    answerTh?: string;
    answerEn?: string | null;
    topic?: string | null;
  }
): Promise<FaqDetail | null> {
  // Build a dynamic UPDATE — only set what was provided.
  const sets: ReturnType<typeof sql>[] = [];
  if (edits.questionTh !== undefined) sets.push(sql`question_th = ${edits.questionTh}`);
  if (edits.questionEn !== undefined) sets.push(sql`question_en = ${edits.questionEn}`);
  if (edits.answerTh !== undefined) sets.push(sql`answer_th = ${edits.answerTh}`);
  if (edits.answerEn !== undefined) sets.push(sql`answer_en = ${edits.answerEn}`);
  if (edits.topic !== undefined) sets.push(sql`topic = ${edits.topic}`);
  if (sets.length === 0) return getFaqById(id);

  // Join the SET fragments with commas
  const setClause = sets.reduce<ReturnType<typeof sql>>((acc, frag, i) => {
    return i === 0 ? frag : sql`${acc}, ${frag}`;
  }, sql``);

  await db.execute(sql`
    UPDATE faqs
    SET ${setClause},
        updated_at = now()
    WHERE id = ${id}
  `);
  return getFaqById(id);
}
