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

// NOTE: Generated tsvector columns and pg_trgm GIN indexes live only in the
// raw SQL migrations under drizzle/, not here:
//   - regulations.search_vector_en/_th (GENERATED ALWAYS, drizzle-kit can't model)
//   - faqs.search_vector_en/_th        (same)
//   - GIN(pg_trgm) indexes on title_th, body_th, question_th, answer_th
// lib/search.ts reads them via raw SQL.

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
    // 'sec_nrs' (crawled from capital.sec.or.th) | 'internal_playbook' (SCG content)
    sourceType: varchar("source_type", { length: 32 }).notNull().default("sec_nrs"),
    // SEC's surrogate key from the PDF URL filename. NULL for internal_playbook rows.
    // Dedup contract for sec_nrs rows (partial unique index).
    docId: integer("doc_id"),
    // The NRS bucket the doc lives in. NULL for internal_playbook.
    refId: integer("ref_id"),
    // Dedup contract for internal_playbook rows (e.g. 'pb-2.1'). NULL for sec_nrs.
    playbookSlug: varchar("playbook_slug", { length: 64 }),
    regulationTypeId: integer("regulation_type_id").references(
      () => regulationTypes.id,
      { onDelete: "set null" }
    ),
    titleTh: text("title_th").notNull(),
    titleEn: text("title_en"),
    regNumber: varchar("reg_number", { length: 32 }),
    documentType: text("document_type"),
    subject: text("subject"),
    publicationDate: date("publication_date"),
    effectiveDate: date("effective_date"),
    status: varchar("status", { length: 32 }),
    pdfUrl: text("pdf_url"),
    pdfTextUrl: text("pdf_text_url"),
    docUrl: text("doc_url"),
    // NULL for internal_playbook (no canonical external URL)
    sourceUrl: text("source_url"),
    bodyTh: text("body_th"),
    bodyEn: text("body_en"),
    wordCount: integer("word_count").notNull().default(0),
    // Audit fields for source_type='uploaded'
    uploadedBy: text("uploaded_by"),
    originalFilename: text("original_filename"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    sourceTypeIdx: index("regulations_source_type_idx").on(t.sourceType),
    refIdIdx: index("regulations_ref_id_idx").on(t.refId),
    typeIdx: index("regulations_type_idx").on(t.regulationTypeId),
    pubDateIdx: index("regulations_pub_date_idx").on(t.publicationDate),
    effectiveDateIdx: index("regulations_effective_date_idx").on(t.effectiveDate),
    statusIdx: index("regulations_status_idx").on(t.status),
  })
);

export const faqs = pgTable(
  "faqs",
  {
    id: serial("id").primaryKey(),
    questionTh: text("question_th").notNull(),
    questionEn: text("question_en"),
    answerTh: text("answer_th").notNull(),
    answerEn: text("answer_en"),
    regulationId: integer("regulation_id").references(
      () => regulations.id,
      { onDelete: "set null" }
    ),
    // 'imported' | 'ai_generated' | 'manual'
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    // 'draft' | 'verified' | 'rejected'
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    model: varchar("model", { length: 64 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: text("verified_by"),
    topic: varchar("topic", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    statusIdx: index("faqs_status_idx").on(t.status),
    sourceIdx: index("faqs_source_idx").on(t.source),
    topicIdx: index("faqs_topic_idx").on(t.topic),
    regulationIdIdx: index("faqs_regulation_id_idx").on(t.regulationId),
  })
);

export type RegulationType = typeof regulationTypes.$inferSelect;
export type Regulation = typeof regulations.$inferSelect;
export type Faq = typeof faqs.$inferSelect;
