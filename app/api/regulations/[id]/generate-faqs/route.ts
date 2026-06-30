import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { generateAndSaveFaqs } from "@/lib/faq-generator";
import { getCurrentPermissions } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const perms = await getCurrentPermissions();
  if (!perms.canGenerateFaqs) {
    return NextResponse.json(
      { error: "Permission denied: this action requires a verifier or admin role." },
      { status: 403 }
    );
  }
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // Load the regulation row
  const rows = await db.execute<{
    id: number;
    title_th: string;
    title_en: string | null;
    body_th: string | null;
    body_en: string | null;
  } & Record<string, unknown>>(sql`
    SELECT id, title_th, title_en, body_th, body_en
    FROM regulations WHERE id = ${id} LIMIT 1
  `);
  const reg = rows.rows[0];
  if (!reg) return NextResponse.json({ error: "regulation not found" }, { status: 404 });
  if (!reg.body_th && !reg.body_en) {
    return NextResponse.json(
      { error: "regulation has no body text — cannot generate FAQs" },
      { status: 422 }
    );
  }
  if ((reg.body_th?.length ?? 0) + (reg.body_en?.length ?? 0) < 200) {
    return NextResponse.json(
      { error: "regulation body is too short to generate meaningful FAQs" },
      { status: 422 }
    );
  }

  try {
    const result = await generateAndSaveFaqs({
      regulationId: reg.id,
      titleTh: reg.title_th,
      titleEn: reg.title_en,
      bodyTh: reg.body_th,
      bodyEn: reg.body_en,
    });
    return NextResponse.json({
      count: result.count,
      faqIds: result.faqIds,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "FAQ generation failed" },
      { status: 500 }
    );
  }
}
