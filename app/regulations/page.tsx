import { sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import { listRegulationTypes } from "@/lib/search";
import { RegulationCard } from "@/components/regulation-card";
import { RegulationAskForm } from "@/components/regulation-ask-form";
import type { RegulationSearchRow } from "@/lib/search";

export const revalidate = 300;

interface PageParams {
  type?: string;
  subject?: string;
  page?: string;
}

const PAGE_SIZE = 24;

async function fetchPage(opts: { typeSlug?: string; subject?: string; page: number }) {
  const offset = (opts.page - 1) * PAGE_SIZE;
  const rowsRes = await db.execute(sql`
    SELECT
      r.id,
      r.doc_id AS "docId",
      r.ref_id AS "refId",
      r.title_th AS "titleTh",
      r.title_en AS "titleEn",
      r.title_th AS "titleSnippet",
      coalesce(substring(r.body_th from 1 for 240), '') AS "bodySnippet",
      r.reg_number AS "regNumber",
      r.document_type AS "documentType",
      r.subject,
      to_char(r.publication_date, 'YYYY-MM-DD') AS "publicationDate",
      to_char(r.effective_date, 'YYYY-MM-DD') AS "effectiveDate",
      r.status,
      r.source_url AS "sourceUrl",
      r.pdf_url AS "pdfUrl",
      rt.name_en AS "regulationTypeName",
      rt.slug AS "regulationTypeSlug",
      0::float AS rank
    FROM regulations r
    LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
    WHERE 1=1
      ${opts.typeSlug ? sql`AND rt.slug = ${opts.typeSlug}` : sql``}
      ${opts.subject ? sql`AND r.subject = ${opts.subject}` : sql``}
    ORDER BY r.publication_date DESC NULLS LAST, r.id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `);
  const countRes = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM regulations r
    LEFT JOIN regulation_types rt ON rt.id = r.regulation_type_id
    WHERE 1=1
      ${opts.typeSlug ? sql`AND rt.slug = ${opts.typeSlug}` : sql``}
      ${opts.subject ? sql`AND r.subject = ${opts.subject}` : sql``}
  `);
  return {
    rows: rowsRes.rows as unknown as RegulationSearchRow[],
    total: (countRes.rows[0] as { n: number })?.n ?? 0,
  };
}

export default async function RegulationsPage({
  searchParams,
}: {
  searchParams: Promise<PageParams>;
}) {
  const { type, subject, page: rawPage } = await searchParams;
  const typeSlug = (type ?? "").trim() || undefined;
  const subjectFilter = (subject ?? "").trim() || undefined;
  const page = Math.max(1, Number(rawPage) || 1);

  const [{ rows, total }, types] = await Promise.all([
    fetchPage({ typeSlug, subject: subjectFilter, page }).catch(() => ({ rows: [], total: 0 })),
    listRegulationTypes().catch(() => []),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeType = types.find((t) => t.slug === typeSlug);

  return (
    <div className="container py-12">
      <p className="eyebrow mb-2">Regulations</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {activeType
          ? `${activeType.nameEn}`
          : subjectFilter
            ? `Subject: ${subjectFilter}`
            : "All regulations"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
        {total.toLocaleString()} {total === 1 ? "regulation" : "regulations"}
      </p>

      {/* AI ask box — primary search entry point */}
      <section className="mt-6 surface p-5">
        <RegulationAskForm />
      </section>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <Link
          href="/regulations"
          className={
            !typeSlug && !subjectFilter
              ? "rounded-full bg-foreground text-background px-3 py-1 font-medium"
              : "rounded-full border border-border/70 px-3 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition"
          }
        >
          All
        </Link>
        {types
          .filter((t) => t.regulationCount > 0)
          .map((t) => (
            <Link
              key={t.id}
              href={`/regulations?type=${t.slug}`}
              className={
                typeSlug === t.slug
                  ? "rounded-full bg-foreground text-background px-3 py-1 font-medium"
                  : "rounded-full border border-border/70 px-3 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition"
              }
            >
              {t.nameEn}{" "}
              <span className="tabular-nums opacity-60">{t.regulationCount}</span>
            </Link>
          ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-12 surface p-8 text-center">
          <p className="font-medium text-foreground">
            {typeSlug === "uploaded-document"
              ? "No documents uploaded yet."
              : typeSlug === "agm-playbook"
              ? "Playbook not loaded yet."
              : typeSlug
              ? "Nothing in this category yet."
              : "No regulations indexed yet."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {typeSlug === "uploaded-document" ? (
              <>
                Go to{" "}
                <Link href="/upload" className="underline underline-offset-2 hover:no-underline">
                  /upload
                </Link>{" "}
                to add a PDF, DOCX, or text document.
              </>
            ) : typeSlug === "agm-playbook" ? (
              <>
                Run <code className="rounded bg-secondary px-1.5 py-0.5">npm run load:playbook</code>{" "}
                to import the AGM Compliance Playbook from the Notion export.
              </>
            ) : (
              <>
                Run <code className="rounded bg-secondary px-1.5 py-0.5">npm run ingest</code>{" "}
                to crawl the Thai SEC portal, or{" "}
                <Link href="/upload" className="underline underline-offset-2 hover:no-underline">
                  /upload
                </Link>{" "}
                to add a document manually.
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rows.map((r) => (
              <RegulationCard key={r.id} row={r} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
              {page > 1 && (
                <Link
                  href={`/regulations?${new URLSearchParams({
                    ...(typeSlug ? { type: typeSlug } : {}),
                    ...(subjectFilter ? { subject: subjectFilter } : {}),
                    page: String(page - 1),
                  }).toString()}`}
                  className="rounded border border-border/70 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30"
                >
                  ← Prev
                </Link>
              )}
              <span className="tabular-nums text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/regulations?${new URLSearchParams({
                    ...(typeSlug ? { type: typeSlug } : {}),
                    ...(subjectFilter ? { subject: subjectFilter } : {}),
                    page: String(page + 1),
                  }).toString()}`}
                  className="rounded border border-border/70 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30"
                >
                  Next →
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
