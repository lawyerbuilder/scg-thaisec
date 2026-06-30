"use client";

import { useLocale } from "@/hooks/use-locale";
import { truncate } from "@/lib/utils";

/**
 * Locale-aware truncated text snippet. Same fallback semantics as
 * <LocalizedText>: shows the preferred-language text if present, falls back
 * to the other language. Truncates to `max` chars with an ellipsis.
 */
export function LocalizedTruncated({
  en,
  th,
  max = 240,
  className,
}: {
  en?: string | null;
  th?: string | null;
  max?: number;
  className?: string;
}) {
  const [locale] = useLocale();
  const preferEn = locale === "en";
  const raw = preferEn ? en || th || "" : th || en || "";
  const isThai = !preferEn ? !!th : !en && !!th;
  const cls = [className, isThai ? "lang-th" : ""].filter(Boolean).join(" ");
  return <p className={cls || undefined}>{truncate(raw, max)}</p>;
}
