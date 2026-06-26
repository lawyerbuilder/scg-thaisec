"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

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

function writeIds(ids: number[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("scg-thaisec:favorites-change"));
}

export function FavoriteButton({ id, className }: { id: number; className?: string }) {
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    setIsFav(readIds().includes(id));
    function onChange() {
      setIsFav(readIds().includes(id));
    }
    window.addEventListener("scg-thaisec:favorites-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("scg-thaisec:favorites-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [id]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ids = readIds();
    if (ids.includes(id)) {
      writeIds(ids.filter((x) => x !== id));
    } else {
      writeIds([id, ...ids]);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isFav}
      aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground transition-colors hover:border-foreground/30",
        isFav && "border-primary/50 text-primary",
        className
      )}
    >
      <Star className={cn("h-3.5 w-3.5", isFav && "fill-current")} />
    </button>
  );
}
