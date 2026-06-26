import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  integer,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// NOTE: Two generated columns and three GIN indexes live only in
// drizzle/0000_init.sql, not here:
//   - regulations.search_vector_en (tsvector, english config) — generated
//   - regulations.search_vector_th (tsvector, simple config)  — generated
//   - GIN(pg_trgm) indexes on title_th and body_th
// drizzle-kit can't model GENERATED ALWAYS columns or trigram-op indexes,
// so we keep the raw SQL as source of truth. lib/search.ts reads them via
// raw SQL.

export const regulationTypes = pgTable(
  "regulation_types",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    nameEn: text("name_en").notNull(),
    nameTh: text("name_th").notNull(),
    descriptionEn: text("description_en"),
    descriptionTh: text("description_th"),
    category: varchar("category", { length: 64 }),
  },
  (t) => ({
    slugIdx: uniqueIndex("regulation_types_slug_idx").on(t.slug),
  })
);

export const regulations = pgTable(
  "regulations",
  {
    id: serial("id").primaryKey(),
    // SEC's internal surrogate key extracted from the PDF URL filename.
    // This is the dedup contract — analog of OpenClauses' accession_number.
    docId: integer("doc_id").notNull(),
    // The NRS bucket the doc lives in (nrs_search_new.php?ref_id=N)
    refId: integer("ref_id").notNull(),
    regulationTypeId: integer("regulation_type_id").references(
      () => regulationTypes.id,
      { onDelete: "set null" }
    ),
    titleTh: text("title_th").notNull(),
    titleEn: text("title_en"),
    // Human regulation number parsed from title, e.g. "1/2555"
    regNumber: varchar("reg_number", { length: 32 }),
    // "Notification of the SEC" / "Notification of the Capital Market Supervisory Board" / "Act" / …
    documentType: text("document_type"),
    // "Securities Issuance" / "Asset Management" / "Digital Assets" / …
    subject: text("subject"),
    publicationDate: date("publication_date"),
    effectiveDate: date("effective_date"),
    // "in_force" | "on_process" | "repealed" | null (unknown)
    status: varchar("status", { length: 32 }),
    pdfUrl: text("pdf_url"),
    pdfTextUrl: text("pdf_text_url"),
    docUrl: text("doc_url"),
    sourceUrl: text("source_url").notNull(),
    bodyTh: text("body_th"),
    bodyEn: text("body_en"),
    wordCount: integer("word_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    docIdIdx: uniqueIndex("regulations_doc_id_idx").on(t.docId),
    refIdIdx: index("regulations_ref_id_idx").on(t.refId),
    typeIdx: index("regulations_type_idx").on(t.regulationTypeId),
    pubDateIdx: index("regulations_pub_date_idx").on(t.publicationDate),
    effectiveDateIdx: index("regulations_effective_date_idx").on(t.effectiveDate),
    statusIdx: index("regulations_status_idx").on(t.status),
  })
);

export type RegulationType = typeof regulationTypes.$inferSelect;
export type Regulation = typeof regulations.$inferSelect;
