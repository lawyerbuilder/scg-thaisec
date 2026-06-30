"use client";

import { useLocale } from "@/hooks/use-locale";
import { MarkdownBody } from "./markdown-body";
import { CopyButton } from "./copy-button";
import { Languages } from "lucide-react";
import { useState } from "react";

/**
 * Locale-aware body renderer for regulation / FAQ detail pages.
 *
 * Default: shows ONLY the user's preferred language (EN or TH per the header
 * toggle). When only one language has content, shows that one regardless.
 *
 * The "Show both" toggle lets the lawyer cross-reference original Thai +
 * English translation side-by-side — useful for verification and trust.
 */
export function LocalizedBody({
  bodyEn,
  bodyTh,
}: {
  bodyEn: string;
  bodyTh: string;
}) {
  const [locale] = useLocale();
  const [showBoth, setShowBoth] = useState(false);

  const hasEn = bodyEn.trim().length > 0;
  const hasTh = bodyTh.trim().length > 0;
  const bothAvailable = hasEn && hasTh;
  const preferEn = locale === "en";
  const onlyOne = !bothAvailable;

  // What to render:
  // - If both languages exist AND user clicked "Show both" → both
  // - Else: just the preferred language (fall back to the other if empty)
  // - If only one exists, just that one (no toggle visible)
  const showEnglish =
    showBoth ||
    onlyOne
      ? hasEn
      : preferEn && hasEn;
  const showThai =
    showBoth ||
    onlyOne
      ? hasTh
      : !preferEn && hasTh;

  // Picked preference but it's empty → fall back to the other
  const fallbackEn = preferEn && !hasEn && hasTh;
  const fallbackTh = !preferEn && !hasTh && hasEn;

  return (
    <div>
      {bothAvailable && (
        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowBoth((b) => !b)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            <Languages className="h-3.5 w-3.5" />
            {showBoth ? "Show one language only" : "Show both languages"}
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* English block — render when: showBoth, or English is preferred, or only English exists, or Thai is preferred but missing */}
        {(showBoth || (preferEn && hasEn) || (!hasTh && hasEn) || fallbackTh) && hasEn && (
          <section className="surface p-6 sm:p-8 relative">
            <div className="flex items-center justify-between mb-4">
              <p className="eyebrow">English{fallbackTh ? " (Thai unavailable)" : ""}</p>
              <CopyButton text={bodyEn} />
            </div>
            <MarkdownBody source={bodyEn} />
          </section>
        )}

        {/* Thai block */}
        {(showBoth || (!preferEn && hasTh) || (!hasEn && hasTh) || fallbackEn) && hasTh && (
          <section className="surface p-6 sm:p-8 relative">
            <div className="flex items-center justify-between mb-4">
              <p className="eyebrow">Thai{fallbackEn ? " (English unavailable)" : ""}</p>
              <CopyButton text={bodyTh} />
            </div>
            <MarkdownBody source={bodyTh} isThai />
          </section>
        )}
      </div>
    </div>
  );
}
