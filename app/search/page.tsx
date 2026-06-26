import Link from "next/link";
import { Suspense } from "react";
import { SearchBar } from "@/components/search-bar";
import { RegulationCard } from "@/components/regulation-card";
import { searchRegulations, countRegulations, listRegulationTypes } from "@/lib/search";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  type?: string;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, type } = await searchParams;
  const query = (q ?? "").trim();
  const typeSlug = (type ?? "").trim() || undefined;

  if (!query) {
    return (
      <div className="container py-16">
        <Suspense fallback={null}>
          <SearchBar />
        </Suspense>
        <p className="mt-6 text-sm text-muted-foreground">
          Enter a query to search the library.
        </p>
      </div>
    );
  }

  const [results, total, types] = await Promise.all([
    searchRegulations({ query, typeSlug, limit: 25 }).catch(() => []),
    countRegulations({ query, typeSlug }).catch(() => 0),
    listRegulationTypes().catch(() => []),
  ]);

  return (
    <div className="container py-12">
      <div className="max-w-3xl">
        <p className="eyebrow mb-2">Search</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {total.toLocaleString()} {total === 1 ? "result" : "results"} for{" "}
          <span className="text-primary">&ldquo;{query}&rdquo;</span>
        </h1>
      </div>

      <div className="mt-6 max-w-2xl">
        <Suspense fallback={null}>
          <SearchBar />
        </Suspense>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <Link
          href={`/search?q=${encodeURIComponent(query)}`}
          className={
            !typeSlug
              ? "rounded-full bg-foreground text-background px-3 py-1 font-medium"
              : "rounded-full border border-border/70 px-3 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition"
          }
        >
          All categories
        </Link>
        {types
          .filter((t) => t.regulationCount > 0)
          .map((t) => (
            <Link
              key={t.id}
              href={`/search?q=${encodeURIComponent(query)}&type=${t.slug}`}
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

      {results.length === 0 ? (
        <div className="mt-12 surface p-8 text-center">
          <p className="font-medium text-foreground">No results.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a broader query, or remove the category filter.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {results.map((r) => (
            <RegulationCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
