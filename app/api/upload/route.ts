/**
 * POST /api/upload
 *
 * Accepts a multipart upload (PDF / DOCX / TXT / MD), extracts text, creates
 * a regulations row (source_type='uploaded'), and immediately generates AI
 * FAQs grounded in the content. Returns the new regulation id + FAQ count
 * so the UI can redirect to /faq filtered to those new rows.
 *
 * TODO(auth): gate this with Clerk + allowlist. For now anyone can upload —
 * matches the same TODO in app/faq/[id]/actions.ts.
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { extractFromBuffer, countWords } from "@/lib/parse-document";
import { generateAndSaveFaqs } from "@/lib/faq-generator";
import { containsThai } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing 'file' field" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `file exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB limit` },
      { status: 413 }
    );
  }

  const titleOverride = (formData.get("title") as string | null)?.trim() ?? "";
  const skipFaqGen = formData.get("skipFaqs") === "true";

  // 1. Extract text
  let extracted;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    extracted = await extractFromBuffer(buffer, file.type, file.name);
  } catch (err) {
    return NextResponse.json(
      { error: `parse failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  if (extracted.text.length < 100) {
    return NextResponse.json(
      {
        error:
          "extracted text is suspiciously short (<100 chars). The PDF may be a scanned image (OCR needed) or the file is empty.",
      },
      { status: 422 }
    );
  }

  // 2. Look up the 'uploaded-document' regulation_type
  const typeRow = await db.execute<{ id: number }>(
    sql`SELECT id FROM regulation_types WHERE slug = 'uploaded-document' LIMIT 1`
  );
  const typeId = typeRow.rows[0]?.id ?? null;

  // 3. Insert regulations row
  const title = titleOverride || stripExtension(file.name);
  const looksThai = containsThai(extracted.text.slice(0, 500));
  const bodyTh = looksThai ? extracted.text : null;
  const bodyEn = looksThai ? null : extracted.text;

  const inserted = await db.execute<{ id: number }>(sql`
    INSERT INTO regulations (
      source_type, regulation_type_id,
      title_th, title_en,
      subject, document_type,
      body_th, body_en, word_count,
      uploaded_by, original_filename
    ) VALUES (
      'uploaded',
      ${typeId},
      ${looksThai ? title : title},
      ${looksThai ? null : title},
      ${"Uploaded Document"},
      ${"Uploaded"},
      ${bodyTh},
      ${bodyEn},
      ${countWords(extracted.text)},
      ${"preview@scg-thaisec.local"},
      ${file.name}
    )
    RETURNING id
  `);
  const regulationId = inserted.rows[0]?.id;
  if (!regulationId) {
    return NextResponse.json({ error: "failed to insert regulation" }, { status: 500 });
  }

  // 4. Optionally generate FAQs immediately
  let faqResult: { count: number; faqIds: number[] } = { count: 0, faqIds: [] };
  let faqError: string | null = null;
  if (!skipFaqGen) {
    try {
      faqResult = await generateAndSaveFaqs({
        regulationId,
        titleTh: looksThai ? title : title,
        titleEn: looksThai ? null : title,
        bodyTh,
        bodyEn,
      });
    } catch (err) {
      faqError = (err as Error).message;
    }
  }

  return NextResponse.json({
    regulationId,
    title,
    bytes: file.size,
    chars: extracted.text.length,
    pageCount: extracted.pageCount,
    faqsGenerated: faqResult.count,
    faqIds: faqResult.faqIds,
    faqError,
  });
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}
