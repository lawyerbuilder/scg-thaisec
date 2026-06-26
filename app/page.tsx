import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { FavoritesGrid } from "@/components/favorites-grid";
import {
  listRegulationTypes,
  listSubjectCounts,
  getCorpusStats,
} from "@/lib/search";

export const revalidate = 300;

const POPULAR_QUERIES = [
  "digital asset",
  "asset management",
  "disclosure",
  "ประกาศ",
  "หลักทรัพย์",
  "trust",
  "fund manager",
  "ETF",
];

export default async function HomePage() {
  const [types, subjects, stats] = await Promise.all([
    listRegulationTypes().catch(() => []),
    listSubjectCounts().catch(() => []),
    getCorpusStats().catch(() => null),
  ]);

  const topSubjects = subjects.slice(0, 8);

  return (
    <div className="container py-16 sm:py-24">
      <section className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground mb-7">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-foreground">SCG Legal</span>
          <span className="text-border">·</span>
          <span>Internal use only</span>
        </div>

        <h1 className="text-[2.5rem] sm:text-[3.25rem] font-semibold tracking-tight leading-[1.05] text-balance">
          A regulation library for the Thai capital markets.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground text-balance max-w-2xl mx-auto leading-relaxed">
          Search and browse Thai SEC notifications, regulations, and circulars indexed from
          public sources at capital.sec.or.th — bilingual, with source attribution.
        </p>

        <div className="mt-10">
          <Suspense fallback={<div className="h-14 rounded-md border bg-card" />}>
            <SearchBar />
          </Suspense>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
          {POPULAR_QUERIES.map((q) => (
            <Link
              key={q}
              href={`/search?q=${encodeURIComponent(q)}`}
              className="rounded-full border border-border/70 bg-card px-3 py-1 text-muted-foreground hover:border-foreground/30 hover:text-foreground transition"
            >
              {q}
            </Link>
          ))}
        </div>

        {stats && stats.totalRegulations > 0 && (
          <p className="mt-10 text-xs text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">
              {stats.totalRegulations.toLocaleString()}
            </span>{" "}
            regulations across{" "}
            <span className="font-semibold text-foreground">
              {stats.totalTypes.toLocaleString()}
            </span>{" "}
            categories
            {stats.latestPublicationDate && (
              <>
                {" "}· latest{" "}
                <span className="font-semibold text-foreground">
                  {stats.latestPublicationDate}
                </span>
              </>
            )}
          </p>
        )}

        <Link
          href="/connect"
          className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          <span>
            Or use it from{" "}
            <span className="text-foreground font-medium">Claude or ChatGPT</span> directly
          </span>
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </section>

      {topSubjects.length > 0 && (
        <section className="mt-24">
          <div className="flex items-baseline justify-between mb-7">
            <div>
              <p className="eyebrow mb-1">Subjects</p>
              <h2 className="text-xl font-semibold tracking-tight">Browse by subject</h2>
            </div>
            <Link
              href="/regulations"
              className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              See all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {topSubjects.map((s) => (
              <Link
                key={s.subject}
                href={`/regulations?subject=${encodeURIComponent(s.subject)}`}
                className="surface surface-hover p-4"
              >
                <div className="font-medium text-[15px] leading-snug">{s.subject}</div>
                <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                  {s.regulationCount.toLocaleString()}{" "}
                  {s.regulationCount === 1 ? "regulation" : "regulations"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {types.length > 0 && (
        <section className="mt-24">
          <div className="flex items-baseline justify-between mb-7">
            <div>
              <p className="eyebrow mb-1">Taxonomy</p>
              <h2 className="text-xl font-semibold tracking-tight">Browse by category</h2>
            </div>
            <Link
              href="/types"
              className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              See all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {types.slice(0, 12).map((t) => (
              <Link
                key={t.id}
                href={`/regulations?type=${t.slug}`}
                className="surface surface-hover p-4"
              >
                <div className="font-medium text-[15px] leading-snug">{t.nameEn}</div>
                <div className="mt-0.5 text-[12px] text-muted-foreground lang-th">{t.nameTh}</div>
                <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                  {t.regulationCount.toLocaleString()}{" "}
                  {t.regulationCount === 1 ? "regulation" : "regulations"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <FavoritesGrid limit={6} />

      {types.length === 0 && (
        <section className="mt-16 mx-auto max-w-2xl surface p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-2">No regulations yet.</p>
          <p>
            The database hasn&apos;t been seeded. Run{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5">npm run seed</code> to load the
            taxonomy, then{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5">npm run ingest</code> to pull
            regulations from capital.sec.or.th.
          </p>
        </section>
      )}
    </div>
  );
}
