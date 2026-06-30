import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { RegulationSearchRow } from "@/lib/search";
import { FavoriteButton } from "./favorite-button";
import { LocalizedText } from "./localized-text";

export function RegulationCard({ row }: { row: RegulationSearchRow }) {
  return (
    <article className="surface surface-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/regulations/${row.id}`} className="block flex-1 min-w-0">
          <LocalizedText
            as="p"
            en={row.titleEn}
            th={row.titleTh}
            className="text-[15px] font-medium leading-snug text-foreground line-clamp-3"
          />
          {row.titleEn && row.titleTh && (
            <LocalizedText
              as="p"
              // The card primary title already shows the user's preferred
              // language; the secondary line shows the OTHER one for users
              // who want to see both.
              en={row.titleTh}
              th={row.titleEn}
              className="mt-1 text-xs text-muted-foreground line-clamp-2"
            />
          )}
        </Link>
        <FavoriteButton id={row.id} />
      </div>

      {row.bodySnippet && (
        <p
          className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3"
          // FTS produces <mark>…</mark> tags; we render them verbatim. Snippet
          // text comes from Postgres ts_headline / substring — no user input.
          dangerouslySetInnerHTML={{ __html: row.bodySnippet }}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
        {row.regNumber && (
          <span className="rounded bg-secondary px-1.5 py-0.5 font-medium text-foreground/80">
            {row.regNumber}
          </span>
        )}
        {row.regulationTypeName && (
          <Link
            href={`/regulations?type=${row.regulationTypeSlug}`}
            className="rounded border border-border/70 px-1.5 py-0.5 hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            {row.regulationTypeName}
          </Link>
        )}
        {row.subject && (
          <span className="rounded border border-border/70 px-1.5 py-0.5">{row.subject}</span>
        )}
        {row.publicationDate && (
          <span>
            <span className="text-foreground/60">Published</span> {row.publicationDate}
          </span>
        )}
        {row.effectiveDate && (
          <span>
            <span className="text-foreground/60">· Effective</span> {row.effectiveDate}
          </span>
        )}
        {row.status === "in_force" && (
          <span className="inline-flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-green-800">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            In force
          </span>
        )}
        {row.pdfUrl && (
          <a
            href={row.pdfUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
          >
            PDF <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  );
}
