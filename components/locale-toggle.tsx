"use client";

import { useLocale } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";

export function LocaleToggle({ className }: { className?: string }) {
  const [locale, setLocale] = useLocale();
  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "inline-flex items-center rounded-md border border-border/70 bg-card p-0.5 text-[11px] font-medium",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={cn(
          "px-2 py-1 rounded-sm transition-colors",
          locale === "en"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("th")}
        aria-pressed={locale === "th"}
        className={cn(
          "px-2 py-1 rounded-sm transition-colors",
          locale === "th"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        ไทย
      </button>
    </div>
  );
}
