-- Migration 0006: widen the lawyers.role enum to support 3 roles.
--
-- Old: 'lawyer' | 'admin'
-- New: 'admin' | 'verifier' | 'user'
--
-- 'lawyer' is renamed to 'verifier' (clearer about what they do).
-- 'user' is added — read-only browse + AI ask, no edit/verify rights.
-- Apply with: npm run db:migrate-raw 0006

ALTER TABLE "lawyers"
  DROP CONSTRAINT IF EXISTS "lawyers_role_check";

-- Migrate existing 'lawyer' rows to 'verifier' before re-applying the check
UPDATE "lawyers" SET "role" = 'verifier' WHERE "role" = 'lawyer';

ALTER TABLE "lawyers"
  ADD CONSTRAINT "lawyers_role_check"
  CHECK ("role" IN ('admin', 'verifier', 'user'));

ALTER TABLE "lawyers"
  ALTER COLUMN "role" SET DEFAULT 'verifier';
