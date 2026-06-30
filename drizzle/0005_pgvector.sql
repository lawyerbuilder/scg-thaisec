-- Migration 0005: pgvector for semantic search at scale.
--
-- Adds vector columns to faqs + regulations (1536 dims = text-embedding-3-small)
-- and HNSW indexes for fast cosine similarity. Existing rows have NULL
-- embeddings until the backfill script (npm run backfill:embeddings) runs.
--
-- Apply with: npm run db:migrate-raw 0005

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "faqs"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

ALTER TABLE "regulations"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- HNSW is the right choice for our scale (thousands → tens-of-thousands).
-- Cosine ops because text-embedding-3-small vectors are not L2-normalized.
CREATE INDEX IF NOT EXISTS "faqs_embedding_hnsw_idx"
  ON "faqs" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "regulations_embedding_hnsw_idx"
  ON "regulations" USING hnsw ("embedding" vector_cosine_ops);
