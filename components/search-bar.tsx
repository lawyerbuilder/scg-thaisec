"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full" role="search">
      <Search
        className={cn(
          "absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none",
          compact ? "h-4 w-4" : "h-5 w-5"
        )}
      />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={
          compact
            ? "Search regulations…"
            : "Search Thai SEC regulations — e.g. \"digital asset\", \"ประกาศ\", \"asset management\""
        }
        className={cn(
          "w-full rounded-md border bg-card pl-10 pr-4 outline-none transition",
          "placeholder:text-muted-foreground/70",
          "focus:ring-2 focus:ring-ring/25 focus:border-ring/60",
          compact
            ? "h-9 text-sm border-border/70"
            : "h-14 text-base border-border shadow-[0_1px_2px_0_rgb(45_20_15/0.04)]"
        )}
        aria-label="Search regulations"
      />
    </form>
  );
}
