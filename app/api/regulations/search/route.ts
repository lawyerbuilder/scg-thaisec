import { NextResponse } from "next/server";
import { searchRegulations, countRegulations } from "@/lib/search";

const SITE = process.env.THAISEC_SITE_URL ?? "https://scg-thaisec.vercel.app";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const type = url.searchParams.get("type")?.trim() || undefined;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), 20);
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });
  const [results, total] = await Promise.all([
    searchRegulations({ query: q, typeSlug: type, limit }),
    countRegulations({ query: q, typeSlug: type }),
  ]);
  return NextResponse.json({
    query: q,
    type: type ?? null,
    total,
    returned: results.length,
    results: results.map((r) => ({
      id: r.id,
      titleEn: r.titleEn,
      titleTh: r.titleTh,
      snippet: r.bodySnippet,
      regNumber: r.regNumber,
      documentType: r.documentType,
      subject: r.subject,
      publicationDate: r.publicationDate,
      effectiveDate: r.effectiveDate,
      status: r.status,
      category: r.regulationTypeName,
      categorySlug: r.regulationTypeSlug,
      sourceUrl: r.sourceUrl,
      pdfUrl: r.pdfUrl,
      detailUrl: `${SITE}/regulations/${r.id}`,
    })),
  });
}
