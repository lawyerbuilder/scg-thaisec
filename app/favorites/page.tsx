"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function FavoritesPage() {
  const [ids, setIds] = useState<number[] | null>(null);

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

  return (
    <div className="container py-12 max-w-4xl">
      <p className="eyebrow mb-2">Favorites</p>
      <h1 className="text-2xl font-semibold tracking-tight">Your saved regulations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Stored on this device only. No account, no sync.
      </p>

      {ids === null ? (
        <div className="mt-12 surface p-8 text-sm text-muted-foreground">Loading…</div>
      ) : ids.length === 0 ? (
        <div className="mt-12 surface p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-2">No favorites yet.</p>
          <p>
            Tap the star on any regulation card to save it here.{" "}
            <Link href="/regulations" className="text-primary hover:underline">
              Browse the library →
            </Link>
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-border/60 border-t border-b border-border/60">
          {ids.map((id) => (
            <li key={id} className="py-3">
              <Link
                href={`/regulations/${id}`}
                className="flex items-center justify-between gap-3 text-sm hover:text-foreground transition-colors"
              >
                <span>
                  <span className="text-muted-foreground">Regulation</span>{" "}
                  <span className="font-medium tabular-nums">#{id}</span>
                </span>
                <span className="text-primary text-xs">View →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
