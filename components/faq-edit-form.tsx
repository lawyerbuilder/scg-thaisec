"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { updateFaqAction, type FaqEditPayload } from "@/app/faq/[id]/actions";

interface EditableFaq {
  id: number;
  questionTh: string;
  questionEn: string;
  answerTh: string;
  answerEn: string;
  topic: string;
}

export function FaqEditForm({ faq }: { faq: EditableFaq }) {
  const [draft, setDraft] = useState<EditableFaq>(faq);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    draft.questionTh !== faq.questionTh ||
    draft.questionEn !== faq.questionEn ||
    draft.answerTh !== faq.answerTh ||
    draft.answerEn !== faq.answerEn ||
    draft.topic !== faq.topic;

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
