-- Initial schema for SCG ThaiSEC.
-- Apply this DIRECTLY in Neon's SQL Editor on first setup. Do NOT use
-- `drizzle-kit push` for this migration — it can't model the generated
-- tsvector columns or the pg_trgm GIN indexes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "regulation_types" (
  "id" serial PRIMARY KEY,
  "slug" varchar(64) NOT NULL,
  "name_en" text NOT NULL,
  "name_th" text NOT NULL,
  "description_en" text,
  "description_th" text,
  "category" varchar(64)
);
CREATE UNIQUE INDEX IF NOT EXISTS "regulation_types_slug_idx"
  ON "regulation_types" ("slug");

CREATE TABLE IF NOT EXISTS "regulations" (
  "id" serial PRIMARY KEY,
  "doc_id" integer NOT NULL,
  "ref_id" integer NOT NULL,
  "regulation_type_id" integer
    REFERENCES "regulation_types"("id") ON DELETE SET NULL,
  "title_th" text NOT NULL,
  "title_en" text,
  "reg_number" varchar(32),
  "document_type" text,
  "subject" text,
  "publication_date" date,
  "effective_date" date,
  "status" varchar(32),
  "pdf_url" text,
  "pdf_text_url" text,
  "doc_url" text,
  "source_url" text NOT NULL,
  "body_th" text,
  "body_en" text,
  "word_count" integer NOT NULL DEFAULT 0,
  -- English tsvector for EN columns (title_en + body_en). Quoted column names
  -- to avoid the bare-`text`-as-type trap from OpenClauses (gotcha #1).
  "search_vector_en" tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'english',
        coalesce("title_en", '') || ' ' || coalesce("body_en", '')
      )
    ) STORED,
  -- 'simple' tokenizer for TH columns — whitespace + punctuation only, no
  -- stemming. Combined with the pg_trgm indexes below it gives us workable
  -- Thai search without a libthai dictionary (which Neon doesn't have).
  "search_vector_th" tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'simple',
        coalesce("title_th", '') || ' ' || coalesce("body_th", '')
      )
    ) STORED,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- doc_id is the dedup contract — analog of OpenClauses' accession_number.
-- Ingestion inserts blindly and catches the unique violation as "duplicate".
CREATE UNIQUE INDEX IF NOT EXISTS "regulations_doc_id_idx"
  ON "regulations" ("doc_id");

CREATE INDEX IF NOT EXISTS "regulations_ref_id_idx"
  ON "regulations" ("ref_id");
CREATE INDEX IF NOT EXISTS "regulations_type_idx"
  ON "regulations" ("regulation_type_id");
CREATE INDEX IF NOT EXISTS "regulations_pub_date_idx"
  ON "regulations" ("publication_date");
CREATE INDEX IF NOT EXISTS "regulations_effective_date_idx"
  ON "regulations" ("effective_date");
CREATE INDEX IF NOT EXISTS "regulations_status_idx"
  ON "regulations" ("status");

-- FTS indexes
CREATE INDEX IF NOT EXISTS "regulations_search_en_idx"
  ON "regulations" USING gin ("search_vector_en");
CREATE INDEX IF NOT EXISTS "regulations_search_th_idx"
  ON "regulations" USING gin ("search_vector_th");

-- Trigram indexes for Thai substring/similarity search.
-- These are the workhorses for Thai queries — `to_tsvector('simple', ...)` on
-- Thai text only splits on whitespace, so most real searches will fall back
-- to ILIKE-style trigram matching.
CREATE INDEX IF NOT EXISTS "regulations_title_th_trgm_idx"
  ON "regulations" USING gin ("title_th" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "regulations_body_th_trgm_idx"
  ON "regulations" USING gin ("body_th" gin_trgm_ops);
