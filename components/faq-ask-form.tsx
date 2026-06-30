"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  FileQuestion,
  ExternalLink,
  Save,
  X,
} from "lucide-react";

type MatchType = "verified_faq" | "draft_faq" | "ai_suggestion" | "no_match";

interface AskResponse {
  matchType: MatchType;
  matchedFaq: {
    id: number;
    questionEn: string | null;
    questionTh: string;
    answerEn: string | null;
    answerTh: string;
    status: string;
    topic: string | null;
  } | null;
  suggestion: {
    questionTh: string;
    questionEn: string;
    answerTh: string;
    answerEn: string;
    topic: string;
    groundedInRegulationId: number | null;
    groundedInRegulationTitle: string | null;
  } | null;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  topFaqCandidates: {
    id: number;
    questionTh: string;
    questionEn: string | null;
    status: string;
    topic: string | null;
  }[];
}

export function FaqAskForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable copy of the AI suggestion (lawyer can tweak before saving)
  const [edit, setEdit] = useState<AskResponse["suggestion"]>(null);
  const [saving, setSaving] = useState(false);

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    setResult(null);
    setEdit(null);
    setPending(true);
    try {
      const res = await fetch("/api/faq/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json as AskResponse);
      if (json.suggestion) setEdit(json.suggestion);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function onSaveDraft() {
    if (!edit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/faq/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edit),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.push(json.faqUrl);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
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
          placeholder="Ask in Thai or English — e.g. 'Can shareholders vote by proxy?', 'องค์ประชุมต้องมีกี่คน?'"
          className="w-full h-12 pl-10 pr-32 rounded-md border border-border bg-card text-[14px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={!question.trim() || pending}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asking…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Ask AI
            </>
          )}
        </button>
      </form>

      <p className="text-[11px] text-muted-foreground">
        AI checks existing FAQs first. If none match, it drafts a new answer from the
        AGM playbook for you to review and save.
      </p>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
          {error}
        </div>
      )}

      {result && (
        <ResultPanel
          result={result}
          edit={edit}
          setEdit={setEdit}
          onSaveDraft={onSaveDraft}
          saving={saving}
          onDismiss={() => {
            setResult(null);
            setEdit(null);
            setQuestion("");
          }}
        />
      )}
    </div>
  );
}

function ResultPanel({
  result,
  edit,
  setEdit,
  onSaveDraft,
  saving,
  onDismiss,
}: {
  result: AskResponse;
  edit: AskResponse["suggestion"];
  setEdit: (e: AskResponse["suggestion"]) => void;
  onSaveDraft: () => void;
  saving: boolean;
  onDismiss: () => void;
}) {
  const { matchType, matchedFaq, suggestion, confidence, reasoning } = result;

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
        <Sparkles className="h-3 w-3" /> AI response · confidence: {confidence}
      </p>

      {matchType === "verified_faq" || matchType === "draft_faq" ? (
        matchedFaq && <MatchedFaqView faq={matchedFaq} matchType={matchType} />
      ) : matchType === "ai_suggestion" ? (
        edit && suggestion && (
          <SuggestionEditor
            edit={edit}
            setEdit={setEdit}
            originalSuggestion={suggestion}
            onSave={onSaveDraft}
            saving={saving}
          />
        )
      ) : (
        <div className="text-sm text-foreground/80">
          <p className="font-medium">No direct answer — but here are FAQs that came up in the search:</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            The AI didn&apos;t confidently match any of these to your question.
            Skim them anyway — the model may have missed a close synonym.
          </p>
        </div>
      )}

      {/* Always-on candidate list — useful when the AI was wrong or unsure */}
      {result.topFaqCandidates.length > 0 && matchType !== "verified_faq" && (
        <CandidatesFallback candidates={result.topFaqCandidates} />
      )}

      <p className="mt-4 text-[11px] text-muted-foreground italic">
        AI reasoning: {reasoning}
      </p>
    </div>
  );
}

function CandidatesFallback({
  candidates,
}: {
  candidates: AskResponse["topFaqCandidates"];
}) {
  return (
    <div className="mt-4 pt-4 border-t border-violet-200/70">
      <p className="eyebrow text-[10px] mb-2 text-violet-700">
        FAQs retrieved by search (top {candidates.length})
      </p>
      <ul className="space-y-1.5">
        {candidates.map((c) => (
          <li key={c.id}>
            <Link
              href={`/faq/${c.id}`}
              className="flex items-start gap-2 rounded-md border border-border bg-card hover:border-foreground/30 px-3 py-2 text-[12px] transition-colors"
            >
              <FileQuestion className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 min-w-0">
                <span className="block font-medium leading-snug">
                  {c.questionEn ?? c.questionTh}
                </span>
                {c.questionEn && (
                  <span className="block text-[11px] text-muted-foreground mt-0.5 lang-th line-clamp-1">
                    {c.questionTh}
                  </span>
                )}
              </span>
              <span className="shrink-0 flex items-center gap-1">
                {c.status === "verified" ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    Verified
                  </span>
                ) : c.status === "draft" ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    Draft
                  </span>
                ) : null}
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchedFaqView({
  faq,
  matchType,
}: {
  faq: NonNullable<AskResponse["matchedFaq"]>;
  matchType: "verified_faq" | "draft_faq";
}) {
  const isVerified = matchType === "verified_faq";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px]">
        {isVerified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
            <CheckCircle2 className="h-3 w-3" /> Verified FAQ found
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5">
            <FileQuestion className="h-3 w-3" /> Draft FAQ found (not yet verified)
          </span>
        )}
        {faq.topic && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            {faq.topic}
          </span>
        )}
      </div>
      <h3 className="text-[15px] font-semibold leading-snug">
        {faq.questionEn ?? faq.questionTh}
      </h3>
      <p className="mt-2 text-[13px] text-foreground/85 leading-relaxed line-clamp-4">
        {faq.answerEn ?? faq.answerTh}
      </p>
      <Link
        href={`/faq/${faq.id}`}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2 hover:no-underline"
      >
        Open full FAQ <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

function SuggestionEditor({
  edit,
  setEdit,
  originalSuggestion,
  onSave,
  saving,
}: {
  edit: NonNullable<AskResponse["suggestion"]>;
  setEdit: (e: AskResponse["suggestion"]) => void;
  originalSuggestion: NonNullable<AskResponse["suggestion"]>;
  onSave: () => void;
  saving: boolean;
}) {
  const dirty =
    edit.questionEn !== originalSuggestion.questionEn ||
    edit.questionTh !== originalSuggestion.questionTh ||
    edit.answerEn !== originalSuggestion.answerEn ||
    edit.answerTh !== originalSuggestion.answerTh ||
    edit.topic !== originalSuggestion.topic;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-800 border border-violet-200 px-2 py-0.5">
          <Sparkles className="h-3 w-3" /> Draft answer suggested
        </span>
        <span className="text-muted-foreground">
          No existing FAQ matched — review the AI&apos;s draft below, edit if needed,
          and save it to the FAQ library.
        </span>
      </div>

      {edit.groundedInRegulationId && edit.groundedInRegulationTitle && (
        <p className="mb-3 text-[12px]">
          Grounded in:{" "}
          <Link
            href={`/regulations/${edit.groundedInRegulationId}`}
            className="text-primary underline underline-offset-2 hover:no-underline"
          >
            {edit.groundedInRegulationTitle}
          </Link>
        </p>
      )}

      <div className="space-y-3">
        <Field label="Question (English)">
          <input
            value={edit.questionEn}
            onChange={(e) => setEdit({ ...edit, questionEn: e.target.value })}
          />
        </Field>
        <Field label="Question (Thai)" thai>
          <input
            value={edit.questionTh}
            onChange={(e) => setEdit({ ...edit, questionTh: e.target.value })}
          />
        </Field>
        <Field label="Answer (English)">
          <textarea
            rows={4}
            value={edit.answerEn}
            onChange={(e) => setEdit({ ...edit, answerEn: e.target.value })}
          />
        </Field>
        <Field label="Answer (Thai)" thai>
          <textarea
            rows={4}
            value={edit.answerTh}
            onChange={(e) => setEdit({ ...edit, answerTh: e.target.value })}
          />
        </Field>
        <Field label="Topic">
          <input
            value={edit.topic}
            onChange={(e) => setEdit({ ...edit, topic: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving…" : dirty ? "Save edited draft" : "Save as draft FAQ"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Saves with status=&quot;draft&quot; — you can then Verify it on the FAQ page.
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  thai,
  children,
}: {
  label: string;
  thai?: boolean;
  children: React.ReactElement;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-[10px] mb-1 block">{label}</span>
      {wrapWithClasses(children, thai)}
    </label>
  );
}

function wrapWithClasses(
  el: React.ReactElement,
  thai?: boolean
): React.ReactElement {
  const base =
    "w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40";
  const cls = `${base}${thai ? " lang-th" : ""}`;
  const props = (el.props ?? {}) as { className?: string };
  return {
    ...el,
    props: { ...props, className: cls + (props.className ? " " + props.className : "") },
  } as React.ReactElement;
}
