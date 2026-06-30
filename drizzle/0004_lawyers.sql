-- Migration 0004: Lawyers roster (admin-managed).
--
-- Replaces the free-text assignee email on uploads with a managed dropdown.
-- The roster is editable via /admin/lawyers. Real auth gating (Clerk) on
-- /admin/* is a separate phase.
--
-- Apply with: npm run db:migrate-raw 0004

CREATE TABLE IF NOT EXISTS "lawyers" (
  "id" serial PRIMARY KEY,
  "email" text NOT NULL,
  "name" text NOT NULL,
  -- 'lawyer' | 'admin' — admins can manage the roster, lawyers can verify
  "role" varchar(16) NOT NULL DEFAULT 'lawyer'
    CHECK ("role" IN ('lawyer', 'admin')),
  "active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Email is the dedup contract (and what we store in faqs.assigned_to)
CREATE UNIQUE INDEX IF NOT EXISTS "lawyers_email_unique_idx"
  ON "lawyers" (lower("email"));

CREATE INDEX IF NOT EXISTS "lawyers_active_idx"
  ON "lawyers" ("active") WHERE "active" IS TRUE;
