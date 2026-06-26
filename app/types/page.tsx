import Link from "next/link";
import { listRegulationTypes, type RegulationTypeRow } from "@/lib/search";

export const revalidate = 600;

export default async function TypesPage() {
  const types = await listRegulationTypes().catch((): RegulationTypeRow[] => []);
  const byCategory = new Map<string, typeof types>();
  for (const t of types) {
    const cat = t.category ?? "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(t);
  }

  return (
    <div className="container py-12 max-w-5xl">
      <p className="eyebrow mb-2">Taxonomy</p>
      <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
        {types.length} categories
      </p>

      {types.length === 0 ? (
        <div className="mt-12 surface p-8 text-center text-sm text-muted-foreground">
          Run <code className="rounded bg-secondary px-1.5 py-0.5">npm run seed</code> to bootstrap the taxonomy.
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {Array.from(byCategory.entries()).map(([cat, list]) => (
            <section key={cat}>
              <h2 className="eyebrow mb-3">{cat}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((t) => (
                  <Link
                    key={t.id}
                    href={`/regulations?type=${t.slug}`}
                    className="surface surface-hover p-4"
                  >
                    <div className="font-medium text-[15px] leading-snug">{t.nameEn}</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground lang-th">{t.nameTh}</div>
                    {t.descriptionEn && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                        {t.descriptionEn}
                      </p>
                    )}
                    <div className="mt-2 text-xs text-muted-foreground tabular-nums">
                      {t.regulationCount.toLocaleString()}{" "}
                      {t.regulationCount === 1 ? "regulation" : "regulations"}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
