import { NextResponse } from "next/server";
import { listRecentRegulations } from "@/lib/search";

const SITE = process.env.THAISEC_SITE_URL ?? "https://scg-thaisec.vercel.app";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), 25);
  const recent = await listRecentRegulations(limit);
  return NextResponse.json({
    count: recent.length,
    regulations: recent.map((r) => ({
      id: r.id,
      titleEn: r.titleEn,
      titleTh: r.titleTh,
      regNumber: r.regNumber,
      documentType: r.documentType,
      subject: r.subject,
      publicationDate: r.publicationDate,
      category: r.regulationTypeName,
      categorySlug: r.regulationTypeSlug,
      sourceUrl: r.sourceUrl,
      pdfUrl: r.pdfUrl,
      detailUrl: `${SITE}/regulations/${r.id}`,
    })),
  });
}
