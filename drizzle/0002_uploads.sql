-- Migration 0002: Document uploads.
--
-- Adds 'uploaded' as a third source_type for regulations, plus a few
-- columns to track where the row came from when it was uploaded:
--   - uploaded_by (Clerk email of the admin who uploaded — for audit)
--   - original_filename (so the UI can show "from contract.pdf")
--
-- Apply directly in Neon SQL Editor.

-- Widen the source_type CHECK to allow 'uploaded'
ALTER TABLE "regulations"
  DROP CONSTRAINT IF EXISTS "regulations_source_type_check";
ALTER TABLE "regulations"
  ADD CONSTRAINT "regulations_source_type_check"
    CHECK ("source_type" IN ('sec_nrs', 'internal_playbook', 'uploaded'));

-- Audit + display fields for uploaded docs
ALTER TABLE "regulations"
  ADD COLUMN IF NOT EXISTS "uploaded_by" text,
  ADD COLUMN IF NOT EXISTS "original_filename" text;

-- Seed a regulation_type for uploads so they appear under their own bucket
INSERT INTO "regulation_types"
  ("slug", "name_en", "name_th", "description_en", "description_th", "category")
VALUES (
  'uploaded-document',
  'Uploaded Document',
  'เอกสารที่อัปโหลด',
  'Documents uploaded by SCG Legal staff. Used as source material for FAQ generation.',
  'เอกสารที่อัปโหลดโดยทีม SCG Legal ใช้เป็นแหล่งข้อมูลสำหรับการสร้าง FAQ',
  'Internal Guidance'
)
ON CONFLICT ("slug") DO NOTHING;
