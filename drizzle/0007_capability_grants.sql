-- Migration 0007: per-user capability grants on top of role defaults.
--
-- Roles (admin/verifier/user) are now templates with sensible defaults.
-- Admins can ALSO grant individual capabilities to specific users via these
-- boolean columns. Effective permission = role default OR per-user grant.
--
-- Examples:
--   - A verifier who's been promoted to also upload docs:
--       role='verifier', grant_upload=true
--   - A trusted user who can verify FAQs but nothing else:
--       role='user', grant_verify_faqs=true
--   - An admin: every grant_* is irrelevant since admin gets everything.

ALTER TABLE "lawyers"
  ADD COLUMN IF NOT EXISTS "grant_verify_faqs" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "grant_edit_faqs"   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "grant_improve_faqs" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "grant_generate_faqs" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "grant_upload"      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "grant_manage_roster" boolean NOT NULL DEFAULT false;
