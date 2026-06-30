"use client";

import { useState, useTransition, createContext, useContext } from "react";
import { CheckCircle2, X, Loader2, AlertCircle } from "lucide-react";
import {
  bulkVerifyFaqsAction,
  bulkRejectFaqsAction,
} from "@/app/faq/[id]/actions";

interface SelectionCtx {
  selected: Set<number>;
  toggle: (id: number) => void;
  clear: () => void;
  selectAll: (ids: number[]) => void;
}

const Ctx = createContext<SelectionCtx | null>(null);

export function FaqSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const value: SelectionCtx = {
    selected,
    toggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    clear: () => setSelected(new Set()),
    selectAll: (ids) => setSelected(new Set(ids)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFaqSelection() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFaqSelection outside FaqSelectionProvider");
  return ctx;
}

/**
 * Per-row checkbox. Renders as a small square that toggles the row's id
 * in the shared selection set. Stops propagation so clicking it doesn't
 * navigate to the FAQ detail page.
 */
export function FaqRowCheckbox({ id }: { id: number }) {
  const { selected, toggle } = useFaqSelection();
  const checked = selected.has(id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      className={`shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
        checked
          ? "bg-primary border-primary text-primary-foreground"
          : "bg-card border-border hover:border-foreground/40"
      }`}
    >
      {checked && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={3} />}
    </button>
  );
}

/**
 * Floating action bar — only visible when at least one row is selected.
 * Sticky to the bottom of the viewport.
 */
export function FaqBulkActionBar({ allIds }: { allIds: number[] }) {
  const { selected, clear, selectAll } = useFaqSelection();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  if (selected.size === 0) return null;

  const ids = Array.from(selected);

  function runBulk(
    fn: (ids: number[]) => Promise<{ verified?: number; rejected?: number }>,
    label: string
  ) {
    setError(null);
    setLastResult(null);
    startTransition(async () => {
      try {
        const res = await fn(ids);
        const count = res.verified ?? res.rejected ?? 0;
        setLastResult(`${count} ${label}`);
        clear();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-3xl w-[calc(100%-2rem)]">
      <div className="rounded-lg border border-border bg-card shadow-lg px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-medium tabular-nums">
            {selected.size} selected
          </span>
          {allIds.length > selected.size && (
            <button
              type="button"
              onClick={() => selectAll(allIds)}
              className="text-[12px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              select all {allIds.length}
            </button>
          )}
          <span className="text-border">·</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => runBulk(bulkVerifyFaqsAction, "verified")}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Verify selected
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => runBulk(bulkRejectFaqsAction, "rejected")}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 text-rose-700 px-3 py-1.5 text-[13px] font-medium hover:bg-rose-100 disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" />
            Reject selected
          </button>
          <button
            type="button"
            onClick={clear}
            className="ml-auto text-[12px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
        {error && (
          <p className="mt-2 text-[12px] text-rose-700 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {error}
          </p>
        )}
        {lastResult && !error && (
          <p className="mt-2 text-[12px] text-emerald-700">✓ {lastResult}</p>
        )}
      </div>
    </div>
  );
}
