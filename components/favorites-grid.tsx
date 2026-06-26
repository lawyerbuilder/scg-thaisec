"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";

const STORAGE_KEY = "scg-thaisec.favorites";

function readIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

/**
 * Lightweight "your favorites" preview block on the home page. We render only
 * the IDs known to localStorage as deep links — the dedicated /favorites page
 * does the database fetch + card render.
 */
export function FavoritesGrid({ limit = 6 }: { limit?: number }) {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    setIds(readIds());
    function onChange() {
      setIds(readIds());
    }
    window.addEventListener("storage", onChange);
    window.addEventListener("scg-thaisec:favorites-change", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("scg-thaisec:favorites-change", onChange);
    };
  }, []);

  if (ids.length === 0) return null;
  const top = ids.slice(0, limit);

  return (
    <section className="mt-24">
      <div className="flex items-baseline justify-between mb-7">
        <div>
          <p className="eyebrow mb-1 flex items-center gap-2">
            <Star className="h-3 w-3 fill-current text-primary" /> Your favorites
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Saved regulations</h2>
        </div>
        <Link
          href="/favorites"
          className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          See all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {top.map((id) => (
          <Link
            key={id}
            href={`/regulations/${id}`}
            className="surface surface-hover p-4 text-sm"
          >
            <span className="text-muted-foreground">Regulation #</span>
            <span className="font-semibold tabular-nums text-foreground">{id}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
