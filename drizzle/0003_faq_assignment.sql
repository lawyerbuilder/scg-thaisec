-- Migration 0003: FAQ assignment workflow.
--
-- Adds `assigned_to` so newly generated FAQs can be routed to a specific
-- lawyer for verification, and an index for "show me my queue" lookups.
-- Apply with `npm run db:migrate-raw 0003`.

ALTER TABLE "faqs"
  ADD COLUMN IF NOT EXISTS "assigned_to" text;

CREATE INDEX IF NOT EXISTS "faqs_assigned_to_idx"
  ON "faqs" ("assigned_to") WHERE "assigned_to" IS NOT NULL;
