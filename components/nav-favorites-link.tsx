"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "scg-thaisec.favorites";

function readCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const ids = JSON.parse(raw) as unknown;
    return Array.isArray(ids) ? ids.length : 0;
  } catch {
    return 0;
  }
}

export function NavFavoritesLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(readCount());
    function onChange() {
      setCount(readCount());
    }
    window.addEventListener("storage", onChange);
    window.addEventListener("scg-thaisec:favorites-change", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("scg-thaisec:favorites-change", onChange);
    };
  }, []);

  return (
    <Link href="/favorites" className="hover:text-foreground transition-colors inline-flex items-center gap-1.5">
      Favorites
      {count > 0 && (
        <span className="rounded-full bg-secondary px-1.5 py-px text-[10px] font-semibold tabular-nums text-foreground/80">
          {count}
        </span>
      )}
    </Link>
  );
}
