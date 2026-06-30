"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, AlertCircle, ExternalLink } from "lucide-react";

export function GenerateFaqsButton({
  regulationId,
  hasBody,
  existingFaqCount,
}: {
  regulationId: number;
  hasBody: boolean;
  existingFaqCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ count: number; faqIds: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (pending) return;
    setError(null);
    setResult(null);
    setPending(true);
    try {
      const res = await fetch(`/api/regulations/${regulationId}/generate-faqs`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-10 rounded-md border border-violet-200 bg-violet-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="eyebrow text-violet-700 mb-1 inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> FAQ generation
          </p>
          {hasBody ? (
            <p className="text-[13px] text-foreground/80">
              {existingFaqCount > 0 ? (
                <>
                  This document already has{" "}
                  <Link
                    href={`/faq?source=ai_generated`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {existingFaqCount} FAQ{existingFaqCount === 1 ? "" : "s"} generated from it
                  </Link>
                  . Generate another batch to draft additional questions.
                </>
              ) : (
                "Generate AI-drafted Q&A pairs from this document. Drafts go to /faq for lawyer review."
              )}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              This document has no body text — FAQs can&apos;t be generated until
              the content is available.
            </p>
          )}
        </div>
        {hasBody && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-4 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate FAQs
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-[12px] text-rose-700 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {result && (
        <p className="mt-3 text-[13px] text-emerald-700 flex items-center gap-2">
          ✨ Generated <strong>{result.count}</strong> draft FAQ{result.count === 1 ? "" : "s"}.
          <Link
            href={`/faq?source=ai_generated&status=draft`}
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
          >
            View them <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      )}
    </div>
  );
}
