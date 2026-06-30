"use client";

import { useState, useTransition } from "react";
import {
  Save,
  Sparkles,
  Loader2,
  Check,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { updateFaqAction, type FaqEditPayload } from "@/app/faq/[id]/actions";

interface EditableFaq {
  id: number;
  questionTh: string;
  questionEn: string;
  answerTh: string;
  answerEn: string;
  topic: string;
}

interface Improvement {
  improvedQuestionTh: string;
  improvedQuestionEn: string;
  improvedAnswerTh: string;
  improvedAnswerEn: string;
  improvementsMade: string[];
  confidence: "high" | "medium" | "low";
  warnings: string[];
  groundedInRegulationId: number | null;
  groundedInRegulationTitle: string | null;
}

export function FaqEditForm({ faq }: { faq: EditableFaq }) {
  const [draft, setDraft] = useState<EditableFaq>(faq);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI improve state
  const [improving, setImproving] = useState(false);
  const [improvement, setImprovement] = useState<Improvement | null>(null);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [improveInstruction, setImproveInstruction] = useState("");

  const dirty =
    draft.questionTh !== faq.questionTh ||
    draft.questionEn !== faq.questionEn ||
    draft.answerTh !== faq.answerTh ||
    draft.answerEn !== faq.answerEn ||
    draft.topic !== faq.topic;

  async function onImprove() {
    if (improving) return;
    setImproveError(null);
    setImprovement(null);
    setImproving(true);
    try {
      const res = await fetch(`/api/faq/${faq.id}/improve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionTh: draft.questionTh,
          questionEn: draft.questionEn,
          answerTh: draft.answerTh,
          answerEn: draft.answerEn,
          userInstruction: improveInstruction.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setImprovement(json as Improvement);
    } catch (e) {
      setImproveError((e as Error).message);
    } finally {
      setImproving(false);
    }
  }

  function applyImprovement() {
    if (!improvement) return;
    setDraft({
      ...draft,
      questionTh: improvement.improvedQuestionTh,
      questionEn: improvement.improvedQuestionEn,
      answerTh: improvement.improvedAnswerTh,
      answerEn: improvement.improvedAnswerEn,
    });
    setImprovement(null); // close panel; lawyer can still tweak before saving
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || pending) return;
    setError(null);
    setSavedAt(null);
    const payload: FaqEditPayload = {
      questionTh: draft.questionTh,
      questionEn: draft.questionEn,
      answerTh: draft.answerTh,
      answerEn: draft.answerEn,
      topic: draft.topic,
    };
    startTransition(async () => {
      try {
        await updateFaqAction(faq.id, payload);
        setSavedAt(new Date().toLocaleTimeString());
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {/* AI improvement panel — sits above the fields */}
      <div className="rounded-md border border-violet-200 bg-violet-50/40 p-4">
        <p className="eyebrow text-[10px] mb-2 text-violet-900 inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Improve with AI
        </p>
        <p className="text-[12px] text-violet-900/80 mb-3">
          Rewrites both the question and the answer. Leave blank for a general
          improvement (clearer, better-cited, more grounded), or type a specific
          instruction — e.g. &ldquo;rephrase the question more clearly&rdquo;,
          &ldquo;make the answer shorter&rdquo;, &ldquo;add the part about
          quorum&rdquo;, &ldquo;cite มาตรา 100&rdquo;, &ldquo;translate the Thai
          more formally&rdquo;.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={improveInstruction}
            onChange={(e) => setImproveInstruction(e.target.value)}
            disabled={improving}
            placeholder="Optional: tell the AI what you want changed…"
            rows={2}
            maxLength={500}
            className="flex-1 rounded-md border border-violet-300 bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400/40 resize-y min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onImprove();
              }
            }}
          />
          <button
            type="button"
            onClick={onImprove}
            disabled={improving}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-violet-600 text-white px-4 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-60 transition-colors sm:self-start sm:min-w-[140px]"
          >
            {improving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {improving ? "Thinking…" : "Improve"}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-violet-900/60">
          Tip: Cmd/Ctrl + Enter to submit. {improveInstruction.length}/500 chars.
        </p>
        {improveError && (
          <p className="mt-2 text-[12px] text-rose-700">
            <AlertCircle className="inline h-3 w-3 mr-1" />
            {improveError}
          </p>
        )}
        {improvement && (
          <ImprovementPreview
            improvement={improvement}
            currentDraft={draft}
            onApply={applyImprovement}
            onDismiss={() => setImprovement(null)}
          />
        )}
      </div>

      <Field label="Question (Thai)">
        <textarea
          value={draft.questionTh}
          onChange={(e) => setDraft({ ...draft, questionTh: e.target.value })}
          className="textarea lang-th min-h-[60px]"
          required
        />
      </Field>
      <Field label="Question (English)">
        <textarea
          value={draft.questionEn}
          onChange={(e) => setDraft({ ...draft, questionEn: e.target.value })}
          className="textarea min-h-[60px]"
        />
      </Field>
      <Field label="Answer (Thai)">
        <textarea
          value={draft.answerTh}
          onChange={(e) => setDraft({ ...draft, answerTh: e.target.value })}
          className="textarea lang-th min-h-[140px]"
          required
        />
      </Field>
      <Field label="Answer (English)">
        <textarea
          value={draft.answerEn}
          onChange={(e) => setDraft({ ...draft, answerEn: e.target.value })}
          className="textarea min-h-[140px]"
        />
      </Field>
      <Field label="Topic">
        <input
          type="text"
          value={draft.topic}
          onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
          className="textarea h-9 py-1.5"
          placeholder="e.g. voting, quorum, dividend"
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!dirty || pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : dirty ? "Save changes" : "No changes"}
        </button>
        {savedAt && <span className="text-xs text-emerald-700">Saved {savedAt}</span>}
        {error && <span className="text-xs text-rose-600">Error: {error}</span>}
      </div>

      <style jsx>{`
        .textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          font-size: 13px;
          line-height: 1.5;
          resize: vertical;
        }
        .textarea:focus {
          outline: none;
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-[10px] mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function ImprovementPreview({
  improvement,
  currentDraft,
  onApply,
  onDismiss,
}: {
  improvement: Improvement;
  currentDraft: EditableFaq;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const qChanged = improvement.improvedQuestionEn !== currentDraft.questionEn;
  const aChanged = improvement.improvedAnswerEn !== currentDraft.answerEn;
  return (
    <div className="mt-3 rounded-md bg-white border border-violet-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-[12px] font-medium text-violet-900">
          Suggested rewrite (confidence: {improvement.confidence})
        </p>
        {improvement.groundedInRegulationId && (
          <Link
            href={`/regulations/${improvement.groundedInRegulationId}`}
            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
          >
            Grounded in: {improvement.groundedInRegulationTitle}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {improvement.improvementsMade.length > 0 && (
        <div className="mb-3">
          <p className="eyebrow text-[10px] mb-1.5">What changed</p>
          <ul className="list-disc ml-5 space-y-0.5 text-[12px] text-foreground/80">
            {improvement.improvementsMade.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {improvement.warnings.length > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 p-2.5">
          <p className="text-[11px] font-medium text-amber-900 mb-1">
            <AlertCircle className="inline h-3 w-3 mr-1" /> Reviewer warnings
          </p>
          <ul className="list-disc ml-5 space-y-0.5 text-[11px] text-amber-900">
            {improvement.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 text-[12px]">
        {qChanged && (
          <DiffRow label="Question (EN)" before={currentDraft.questionEn} after={improvement.improvedQuestionEn} />
        )}
        {aChanged && (
          <DiffRow label="Answer (EN)" before={currentDraft.answerEn} after={improvement.improvedAnswerEn} />
        )}
        {!qChanged && !aChanged && (
          <p className="text-muted-foreground italic">No textual changes suggested.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onApply}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-700 transition-colors"
        >
          <Check className="h-3.5 w-3.5" /> Apply to form
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground/30 transition-colors"
        >
          Dismiss
        </button>
        <span className="text-[11px] text-muted-foreground">
          Apply just fills the form — you still need to click Save changes below.
        </span>
      </div>
    </div>
  );
}

function DiffRow({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="rounded border border-border bg-card p-2">
      <p className="eyebrow text-[10px] mb-1">{label}</p>
      <p className="text-rose-700/80 line-through whitespace-pre-wrap">{before || "(empty)"}</p>
      <p className="mt-1 text-emerald-800 whitespace-pre-wrap">{after}</p>
    </div>
  );
}
