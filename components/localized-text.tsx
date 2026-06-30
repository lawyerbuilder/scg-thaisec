"use client";

import { useLocale } from "@/hooks/use-locale";

/**
 * Renders the EN or TH variant of a piece of text based on the user's
 * current locale preference (header EN/TH toggle).
 *
 * Falls back to the other language if the preferred one is empty, so users
 * never see a blank when only one translation exists.
 *
 * Adds the `.lang-th` class automatically when actually rendering Thai so
 * the Noto Sans Thai font stack kicks in.
 */
export function LocalizedText({
  en,
  th,
  fallback = "",
  className,
  as: As = "span",
}: {
  en?: string | null;
  th?: string | null;
  fallback?: string;
  className?: string;
  as?: "span" | "div" | "p";
}) {
  const [locale] = useLocale();
  const preferEn = locale === "en";
  const text = preferEn ? en || th || fallback : th || en || fallback;
  const renderingThai = !preferEn ? !!th : !en && !!th;
  const cls = [className, renderingThai ? "lang-th" : ""].filter(Boolean).join(" ");
  return <As className={cls || undefined}>{text}</As>;
}
