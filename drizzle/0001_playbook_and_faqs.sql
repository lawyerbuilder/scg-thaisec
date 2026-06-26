-- Migration 0001: Internal playbook content + FAQs.
--
-- Two coordinated changes:
--   1. `regulations` learns to hold internal SCG content (not just SEC crawls).
--      doc_id/ref_id/source_url become nullable; a new `source_type` discriminator
--      ('sec_nrs' vs 'internal_playbook') routes ingestion. A new `playbook_slug`
--      gives internal content its own dedup contract.
--   2. New `faqs` table with question/answer + verification workflow.
--      Linked optionally back to a parent `regulations` row.
--
-- Apply DIRECTLY in Neon's SQL Editor — generated tsvector columns and pg_trgm
-- indexes here use the same pattern as 0000_init.sql which drizzle-kit can't model.

-- ===== Regulations table changes =====

-- Differentiate SEC crawls from internal playbook content
ALTER TABLE "regulations"
  ADD COLUMN IF NOT EXISTS "source_type" varchar(32) NOT NULL DEFAULT 'sec_nrs';

ALTER TABLE "regulations"
  DROP CONSTRAINT IF EXISTS "regulations_source_type_check";
ALTER TABLE "regulations"
  ADD CONSTRAINT "regulations_source_type_check"
    CHECK ("source_type" IN ('sec_nrs', 'internal_playbook'));

-- Playbook content has no SEC doc_id/ref_id/source_url
ALTER TABLE "regulations" ALTER COLUMN "doc_id" DROP NOT NULL;
ALTER TABLE "regulations" ALTER COLUMN "ref_id" DROP NOT NULL;
ALTER TABLE "regulations" ALTER COLUMN "source_url" DROP NOT NULL;

-- Old full unique on doc_id forces SEC dedup on every row. Replace with a
-- partial unique that only applies when doc_id is not null.
DROP INDEX IF EXISTS "regulations_doc_id_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "regulations_doc_id_unique_idx"
  ON "regulations" ("doc_id") WHERE "doc_id" IS NOT NULL;

-- Dedup contract for internal playbook rows (e.g. 'pb-2.1', 'pb-4.3')
ALTER TABLE "regulations"
  ADD COLUMN IF NOT EXISTS "playbook_slug" varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS "regulations_playbook_slug_unique_idx"
  ON "regulations" ("playbook_slug") WHERE "playbook_slug" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "regulations_source_type_idx"
  ON "regulations" ("source_type");

-- Seed the playbook regulation_type
INSERT INTO "regulation_types"
  ("slug", "name_en", "name_th", "description_en", "description_th", "category")
VALUES (
  'agm-playbook',
  'AGM Compliance Playbook',
  'คู่มือการประชุมผู้ถือหุ้น',
  'Internal SCG Legal guide for Annual General Meeting compliance',
  'คู่มือภายในของ SCG Legal สำหรับการประชุมสามัญผู้ถือหุ้น',
  'Internal Guidance'
)
ON CONFLICT ("slug") DO NOTHING;

-- ===== FAQs table =====

CREATE TABLE IF NOT EXISTS "faqs" (
  "id" serial PRIMARY KEY,
  "question_th" text NOT NULL,
  "question_en" text,
  "answer_th" text NOT NULL,
  "answer_en" text,
  -- Optional link to source regulation / playbook section
  "regulation_id" integer
    REFERENCES "regulations"("id") ON DELETE SET NULL,
  -- Where it came from
  "source" varchar(32) NOT NULL DEFAULT 'manual'
    CHECK ("source" IN ('imported', 'ai_generated', 'manual')),
  -- Lifecycle
  "status" varchar(32) NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft', 'verified', 'rejected')),
  -- Model used if ai_generated (e.g. 'openai/gpt-oss-20b')
  "model" varchar(64),
  -- Verifier audit trail (email from Clerk session)
  "verified_at" timestamptz,
  "verified_by" text,
  -- Optional topic tag for browse/filter (e.g. 'voting', 'pdpa', 'litigation')
  "topic" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  -- English tsvector
  "search_vector_en" tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'english',
        coalesce("question_en", '') || ' ' || coalesce("answer_en", '')
      )
    ) STORED,
  -- Thai 'simple' tsvector (paired with pg_trgm indexes below)
  "search_vector_th" tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'simple',
        coalesce("question_th", '') || ' ' || coalesce("answer_th", '')
      )
    ) STORED
);

CREATE INDEX IF NOT EXISTS "faqs_status_idx" ON "faqs" ("status");
CREATE INDEX IF NOT EXISTS "faqs_source_idx" ON "faqs" ("source");
CREATE INDEX IF NOT EXISTS "faqs_topic_idx" ON "faqs" ("topic");
CREATE INDEX IF NOT EXISTS "faqs_regulation_id_idx" ON "faqs" ("regulation_id");

-- FTS indexes
CREATE INDEX IF NOT EXISTS "faqs_search_en_idx"
  ON "faqs" USING gin ("search_vector_en");
CREATE INDEX IF NOT EXISTS "faqs_search_th_idx"
  ON "faqs" USING gin ("search_vector_th");

-- Trigram indexes for Thai substring/similarity search on Q + A
CREATE INDEX IF NOT EXISTS "faqs_question_th_trgm_idx"
  ON "faqs" USING gin ("question_th" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "faqs_answer_th_trgm_idx"
  ON "faqs" USING gin ("answer_th" gin_trgm_ops);
