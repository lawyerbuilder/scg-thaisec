import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { ScrapedRow } from "./nrs";
import { extractPdfText, wordCount } from "./pdf";
import { classifyDocumentType } from "./queries";
import { storeRegulationEmbedding, regulationEmbeddingText } from "@/lib/embeddings";

export type IngestOutcome = "new" | "duplicate" | "skipped" | "error";

export interface IngestResult {
  outcome: IngestOutcome;
  reason?: string;
}

let typeIdBySlugCache: Map<string, number> | null = null;

async function getTypeIdBySlug(slug: string): Promise<number | null> {
  if (!typeIdBySlugCache) {
    typeIdBySlugCache = new Map();
    const res = await db.execute(sql`SELECT id, slug FROM regulation_types`);
    for (const r of res.rows as Array<{ id: number; slug: string }>) {
      typeIdBySlugCache.set(r.slug, r.id);
    }
  }
  return typeIdBySlugCache.get(slug) ?? null;
}

/**
 * Ingest one scraped NRS row. Dedup is delegated to the unique index on
 * regulations.doc_id — we insert blindly and catch the conflict.
 */
export async function ingestOne(row: ScrapedRow): Promise<IngestResult> {
  // Cheap dedup pre-check to skip the PDF fetch entirely on re-runs.
  const existing = await db.execute(sql`
    SELECT 1 FROM regulations WHERE doc_id = ${row.docId} LIMIT 1
  `);
  if (existing.rows.length > 0) {
    return { outcome: "duplicate" };
  }

  const slug = classifyDocumentType(row.documentType);
  const typeId = await getTypeIdBySlug(slug);

  // Prefer the text-layer PDF; the signed scan is usually image-only.
  const bodyTh = await extractPdfText(row.pdfTextUrl);
  const wc = wordCount(bodyTh);

  try {
    const result = await db.execute<{ id: number }>(sql`
      INSERT INTO regulations (
        source_type,
        doc_id, ref_id, regulation_type_id, title_th, reg_number,
        document_type, publication_date, effective_date, status,
        pdf_url, pdf_text_url, doc_url, source_url, body_th, word_count
      ) VALUES (
        'sec_nrs',
        ${row.docId}, ${row.refId}, ${typeId}, ${row.titleTh}, ${row.regNumber},
        ${row.documentType}, ${row.publicationDate}, ${row.effectiveDate}, ${row.status},
        ${row.pdfUrl}, ${row.pdfTextUrl}, ${row.docUrl}, ${row.sourceUrl}, ${bodyTh}, ${wc}
      )
      ON CONFLICT (doc_id) WHERE doc_id IS NOT NULL DO NOTHING
      RETURNING id
    `);
    const newId = result.rows[0]?.id;
    if (newId && bodyTh && bodyTh.length >= 50) {
      // Best-effort vector embedding — failures swallowed in storeRegulationEmbedding
      await storeRegulationEmbedding(
        newId,
        regulationEmbeddingText({
          titleTh: row.titleTh,
          titleEn: null,
          bodyTh,
          bodyEn: null,
        })
      );
    }
    return { outcome: "new" };
  } catch (err) {
    return { outcome: "error", reason: (err as Error).message };
  }
}
