"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Loader2, ExternalLink, X, AlertCircle } from "lucide-react";

interface Citation {
  id: number;
  titleEn: string | null;
  titleTh: string;
  regulationTypeName: string | null;
  regNumber: string | null;
}

interface Response {
  hasAnswer: boolean;
  answer: string;
  citations: Citation[];
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export function RegulationAskForm() {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    setResult(null);
    setPending(true);
    try {
      const res = await fetch("/api/regulations/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json as Response);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onAsk} className="relative">
        <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500" />
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about Thai SEC regulations — e.g. 'What's the quorum requirement?', 'หลักเกณฑ์การประชุมผ่านสื่ออิเล็กทรอนิกส์'"
          className="w-full h-12 pl-10 pr-32 rounded-md border border-border bg-card text-[14px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={!question.trim() || pending}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Ask AI
            </>
          )}
        </button>
      </form>

      <p className="text-[11px] text-muted-foreground">
        AI searches across all regulation bodies + the AGM playbook. Answers
        cite specific regulations you can click through.
      </p>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
          {error}
        </div>
      )}

      {result && <ResultPanel result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

function ResultPanel({
  result,
  onDismiss,
}: {
  result: Response;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-5 relative">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="eyebrow text-violet-700 mb-2 inline-flex items-center gap-1">
        <Sparkles className="h-3 w-3" /> AI answer · confidence: {result.confidence}
      </p>

      {result.hasAnswer ? (
        <>
          <p className="text-[14px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {result.answer}
          </p>
          {result.citations.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow text-[10px] mb-2">Cited regulations</p>
              <ul className="space-y-1.5">
                {result.citations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/regulations/${c.id}`}
                      className="inline-flex items-baseline gap-1.5 text-[13px] text-primary hover:underline"
                    >
                      {c.regulationTypeName && (
                        <span className="text-[11px] text-muted-foreground">
                          {c.regulationTypeName}
                        </span>
                      )}
                      {c.regNumber && (
                        <span className="font-medium tabular-nums">{c.regNumber}</span>
                      )}
                      <span>{c.titleEn ?? c.titleTh}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-foreground/80 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p>{result.answer}</p>
        </div>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground italic">
        AI reasoning: {result.reasoning}
      </p>
    </div>
  );
}
