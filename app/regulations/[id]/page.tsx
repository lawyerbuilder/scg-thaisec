import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, FileText, FileDown } from "lucide-react";
import {
  getRegulationById,
  getRelatedRegulations,
} from "@/lib/search";
import { FavoriteButton } from "@/components/favorite-button";
import { RegulationCard } from "@/components/regulation-card";
import { LocalizedBody } from "@/components/localized-body";

export const revalidate = 600;

export default async function RegulationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) notFound();

  const reg = await getRegulationById(id).catch(() => null);
  if (!reg) notFound();

  const related = await getRelatedRegulations(reg.regulationTypeId, reg.id, 6).catch(() => []);

  const titleEn = reg.titleEn ?? null;
  const titleTh = reg.titleTh;
  const bodyTh = reg.bodyTh ?? "";
  const bodyEn = reg.bodyEn ?? "";
  const hasAnyBody = bodyTh.trim().length > 0 || bodyEn.trim().length > 0;

  return (
    <div className="container py-12 max-w-4xl">
      <nav className="mb-6 text-xs text-muted-foreground">
        <Link href="/regulations" className="hover:text-foreground transition-colors">
          Regulations
        </Link>
        {reg.regulationTypeSlug && (
          <>
            <span className="mx-1.5 text-border">/</span>
            <Link
              href={`/regulations?type=${reg.regulationTypeSlug}`}
              className="hover:text-foreground transition-colors"
            >
              {reg.regulationTypeName}
            </Link>
          </>
        )}
      </nav>

      <article>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {reg.regNumber && (
              <p className="eyebrow mb-2 tabular-nums">No. {reg.regNumber}</p>
            )}
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
              {titleEn ?? titleTh}
            </h1>
            {titleEn && titleTh && (
              <p className="mt-2 text-lg text-muted-foreground lang-th leading-snug">
                {titleTh}
              </p>
            )}
          </div>
          <FavoriteButton id={reg.id} />
        </div>

        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
          {reg.documentType && (
            <div className="rounded-md border border-border/70 bg-card p-3">
              <dt className="eyebrow text-[10px]">Type</dt>
              <dd className="mt-1 text-foreground">{reg.documentType}</dd>
            </div>
          )}
          {reg.subject && (
            <div className="rounded-md border border-border/70 bg-card p-3">
              <dt className="eyebrow text-[10px]">Subject</dt>
              <dd className="mt-1 text-foreground">{reg.subject}</dd>
            </div>
          )}
          {reg.publicationDate && (
            <div className="rounded-md border border-border/70 bg-card p-3">
              <dt className="eyebrow text-[10px]">Published</dt>
              <dd className="mt-1 text-foreground tabular-nums">{reg.publicationDate}</dd>
            </div>
          )}
          {reg.effectiveDate && (
            <div className="rounded-md border border-border/70 bg-card p-3">
              <dt className="eyebrow text-[10px]">Effective</dt>
              <dd className="mt-1 text-foreground tabular-nums">{reg.effectiveDate}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          {reg.pdfUrl && (
            <a
              href={reg.pdfUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" /> Signed PDF
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          )}
          {reg.pdfTextUrl && reg.pdfTextUrl !== reg.pdfUrl && (
            <a
              href={reg.pdfTextUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" /> Text-layer PDF
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          )}
          {reg.docUrl && (
            <a
              href={reg.docUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" /> Word
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          )}
          {reg.sourceUrl && (
            <a
              href={reg.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              Source <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          )}
        </div>

        {hasAnyBody && (
          <div className="mt-10">
            <LocalizedBody bodyEn={bodyEn} bodyTh={bodyTh} />
          </div>
        )}
      </article>

      {related.length > 0 && (
        <section className="mt-16">
          <p className="eyebrow mb-3">Related</p>
          <h2 className="text-xl font-semibold tracking-tight mb-6">
            More in {reg.regulationTypeName ?? "this category"}
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {related.map((r) => (
              <RegulationCard key={r.id} row={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
