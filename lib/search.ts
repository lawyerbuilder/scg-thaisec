import { sql } from "drizzle-orm";
import { db } from "./db";
import { containsThai } from "./utils";

// --------------------------------------------------------------------------
// Shared row shapes — what the UI and MCP both consume.
// --------------------------------------------------------------------------

export interface RegulationSearchRow {
  id: number;
  docId: number;
  refId: number;
  titleTh: string;
  titleEn: string | null;
  titleSnippet: string;
  bodySnippet: string;
  regNumber: string | null;
  documentType: string | null;
  subject: string | null;
  publicationDate: string | null;
  effectiveDate: string | null;
  status: string | null;
  sourceUrl: string;
  pdfUrl: string | null;
  regulationTypeName: string | null;
  regulationTypeSlug: string | null;
  rank: number;
}

export interface RegulationDetail {
  id: number;
  docId: number;
  refId: number;
  titleTh: string;
  titleEn: string | null;
  regNumber: string | null;
  documentType: string | null;
  subject: string | null;
  publicationDate: string | null;
  effectiveDate: string | null;
  status: string | null;
  sourceUrl: string;
  pdfUrl: string | null;
  pdfTextUrl: string | null;
  docUrl: string | null;
  bodyTh: string | null;
  bodyEn: string | null;
  wordCount: number;
  regulationTypeId: number | null;
  regulationTypeName: string | null;
  regulationTypeSlug: string | null;
  createdAt: string;
}

export interface RegulationTypeRow {
  id: number;
  slug: string;
  nameEn: string;
  nameTh: string;
  descriptionEn: string | null;
  descriptionTh: string | null;
  category: string | null;
  regulationCount: number;
}

export interface SubjectCount {
  subject: string;
  regulationCount: number;
}

export interface CorpusStats {
  totalRegulations: number;
  totalTypes: number;
  totalSubjects: number;
  latestPublicationDate: string | null;
}

// --------------------------------------------------------------------------
// Helpers — Thai-aware query routing.
// --------------------------------------------------------------------------

/**
 * Build the `ts_query` text for an English tsvector. Quotes each word, joins
 * with `&`, and adds a `:*` prefix-match suffix so partial words still hit.
 */
function buildEnglishTsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^\w฀-๿]/g, "")) // keep word chars + Thai
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");
}

/**
 * Escape a string for safe use inside a SQL LIKE/ILIKE pattern. We wrap the
 * result with `%…%` at the call site.
 */
function escapeForLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// --------------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------------

export async function searchRegulations(opts: {
  query: string;
  typeSlug?: string;
  limit?: number;
}): Promise<RegulationSearchRow[]> {
  const { query, typeSlug } = opts;
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const useThai = containsThai(query);

  if (useThai) {
    const pattern = `%${escapeForLike(query)}%`;
    const rows = await db.execute(sql`
      SELECT
        r.id,
        r.doc_id AS "docId",
        r.ref_id AS "refId",
        r.title_th AS "titleTh",
        r.title_en AS "titleEn",
        r.title_th AS "titleSnippet",
        coalesce(substring(r.body_th from 1 for 320), '') AS "bodySnippet",
        r.reg_number AS "regNumber",
        r.document_type AS "documentType",
        r.subject,
        to_char(r.publication_date, 'YYYY-MM-DD') AS "publicationDate",
        to_char(r.effective_date, 'YYYY-MM-DD') AS "effectiveDate",
        r.status,
        r.source_url AS "sourceUrl",
        r.pdf_url AS "pdfUrl",
        rt.name_en AS "regulationTypeName",
        rt.slug AS "regulationTypeSlug",
        GREATEST(
          similarity(r.title_th, ${query}),
          similarity(coalesce(r.body_th, ''), ${query})
        ) AS rank
      FROM regulations r
      LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
      WHERE (r.title_th ILIKE ${pattern} OR r.body_th ILIKE ${pattern})
        ${typeSlug ? sql`AND rt.slug = ${typeSlug}` : sql``}
      ORDER BY rank DESC, r.publication_date DESC NULLS LAST
      LIMIT ${limit}
    `);
    return rows.rows as unknown as RegulationSearchRow[];
  }

  const tsq = buildEnglishTsQuery(query);
  if (!tsq) return [];
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.doc_id AS "docId",
      r.ref_id AS "refId",
      r.title_th AS "titleTh",
      r.title_en AS "titleEn",
      coalesce(r.title_en, r.title_th) AS "titleSnippet",
      ts_headline(
        'english',
        coalesce(r.body_en, ''),
        to_tsquery('english', ${tsq}),
        'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=22, MinWords=10, ShortWord=2'
      ) AS "bodySnippet",
      r.reg_number AS "regNumber",
      r.document_type AS "documentType",
      r.subject,
      to_char(r.publication_date, 'YYYY-MM-DD') AS "publicationDate",
      to_char(r.effective_date, 'YYYY-MM-DD') AS "effectiveDate",
      r.status,
      r.source_url AS "sourceUrl",
      r.pdf_url AS "pdfUrl",
      rt.name_en AS "regulationTypeName",
      rt.slug AS "regulationTypeSlug",
      ts_rank(r.search_vector_en, to_tsquery('english', ${tsq})) AS rank
    FROM regulations r
    LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
    WHERE r.search_vector_en @@ to_tsquery('english', ${tsq})
      ${typeSlug ? sql`AND rt.slug = ${typeSlug}` : sql``}
    ORDER BY rank DESC, r.publication_date DESC NULLS LAST
    LIMIT ${limit}
  `);
  return rows.rows as unknown as RegulationSearchRow[];
}

export async function countRegulations(opts: {
  query: string;
  typeSlug?: string;
}): Promise<number> {
  const { query, typeSlug } = opts;
  const useThai = containsThai(query);
  if (useThai) {
    const pattern = `%${escapeForLike(query)}%`;
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM regulations r
      LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
      WHERE (r.title_th ILIKE ${pattern} OR r.body_th ILIKE ${pattern})
        ${typeSlug ? sql`AND rt.slug = ${typeSlug}` : sql``}
    `);
    return (rows.rows[0] as { n: number })?.n ?? 0;
  }
  const tsq = buildEnglishTsQuery(query);
  if (!tsq) return 0;
  const rows = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM regulations r
    LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
    WHERE r.search_vector_en @@ to_tsquery('english', ${tsq})
      ${typeSlug ? sql`AND rt.slug = ${typeSlug}` : sql``}
  `);
  return (rows.rows[0] as { n: number })?.n ?? 0;
}

export async function listRegulationTypes(): Promise<RegulationTypeRow[]> {
  const rows = await db.execute(sql`
    SELECT
      rt.id,
      rt.slug,
      rt.name_en AS "nameEn",
      rt.name_th AS "nameTh",
      rt.description_en AS "descriptionEn",
      rt.description_th AS "descriptionTh",
      rt.category,
      coalesce(c.n, 0)::int AS "regulationCount"
    FROM regulation_types rt
    LEFT JOIN (
      SELECT regulation_type_id, count(*) AS n
      FROM regulations
      WHERE regulation_type_id IS NOT NULL
      GROUP BY regulation_type_id
    ) c ON c.regulation_type_id = rt.id
    ORDER BY rt.category NULLS LAST, rt.name_en
  `);
  return rows.rows as unknown as RegulationTypeRow[];
}

export async function getRegulationById(id: number): Promise<RegulationDetail | null> {
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.doc_id AS "docId",
      r.ref_id AS "refId",
      r.title_th AS "titleTh",
      r.title_en AS "titleEn",
      r.reg_number AS "regNumber",
      r.document_type AS "documentType",
      r.subject,
      to_char(r.publication_date, 'YYYY-MM-DD') AS "publicationDate",
      to_char(r.effective_date, 'YYYY-MM-DD') AS "effectiveDate",
      r.status,
      r.source_url AS "sourceUrl",
      r.pdf_url AS "pdfUrl",
      r.pdf_text_url AS "pdfTextUrl",
      r.doc_url AS "docUrl",
      r.body_th AS "bodyTh",
      r.body_en AS "bodyEn",
      r.word_count AS "wordCount",
      r.regulation_type_id AS "regulationTypeId",
      rt.name_en AS "regulationTypeName",
      rt.slug AS "regulationTypeSlug",
      to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "createdAt"
    FROM regulations r
    LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
    WHERE r.id = ${id}
    LIMIT 1
  `);
  return (rows.rows[0] as unknown as RegulationDetail) ?? null;
}

export async function getRelatedRegulations(
  typeId: number | null,
  excludeId: number,
  limit: number
): Promise<RegulationSearchRow[]> {
  if (typeId === null) return [];
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.doc_id AS "docId",
      r.ref_id AS "refId",
      r.title_th AS "titleTh",
      r.title_en AS "titleEn",
      r.title_th AS "titleSnippet",
      coalesce(substring(r.body_th from 1 for 240), '') AS "bodySnippet",
      r.reg_number AS "regNumber",
      r.document_type AS "documentType",
      r.subject,
      to_char(r.publication_date, 'YYYY-MM-DD') AS "publicationDate",
      to_char(r.effective_date, 'YYYY-MM-DD') AS "effectiveDate",
      r.status,
      r.source_url AS "sourceUrl",
      r.pdf_url AS "pdfUrl",
      rt.name_en AS "regulationTypeName",
      rt.slug AS "regulationTypeSlug",
      0::float AS rank
    FROM regulations r
    LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
    WHERE r.regulation_type_id = ${typeId} AND r.id <> ${excludeId}
    ORDER BY r.publication_date DESC NULLS LAST
    LIMIT ${limit}
  `);
  return rows.rows as unknown as RegulationSearchRow[];
}

export async function listRecentRegulations(limit: number): Promise<RegulationSearchRow[]> {
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.doc_id AS "docId",
      r.ref_id AS "refId",
      r.title_th AS "titleTh",
      r.title_en AS "titleEn",
      r.title_th AS "titleSnippet",
      coalesce(substring(r.body_th from 1 for 240), '') AS "bodySnippet",
      r.reg_number AS "regNumber",
      r.document_type AS "documentType",
      r.subject,
      to_char(r.publication_date, 'YYYY-MM-DD') AS "publicationDate",
      to_char(r.effective_date, 'YYYY-MM-DD') AS "effectiveDate",
      r.status,
      r.source_url AS "sourceUrl",
      r.pdf_url AS "pdfUrl",
      rt.name_en AS "regulationTypeName",
      rt.slug AS "regulationTypeSlug",
      0::float AS rank
    FROM regulations r
    LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `);
  return rows.rows as unknown as RegulationSearchRow[];
}

export async function listSubjectCounts(): Promise<SubjectCount[]> {
  const rows = await db.execute(sql`
    SELECT
      subject,
      count(*)::int AS "regulationCount"
    FROM regulations
    WHERE subject IS NOT NULL AND subject <> ''
    GROUP BY subject
    ORDER BY count(*) DESC, subject
  `);
  return rows.rows as unknown as SubjectCount[];
}

export async function getCorpusStats(): Promise<CorpusStats> {
  const rows = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM regulations) AS "totalRegulations",
      (SELECT count(*)::int FROM regulation_types) AS "totalTypes",
      (SELECT count(DISTINCT subject)::int FROM regulations WHERE subject IS NOT NULL) AS "totalSubjects",
      to_char(
        (SELECT max(publication_date) FROM regulations),
        'YYYY-MM-DD'
      ) AS "latestPublicationDate"
  `);
  return rows.rows[0] as unknown as CorpusStats;
}
