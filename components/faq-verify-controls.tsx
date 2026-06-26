"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, X, RotateCcw } from "lucide-react";
import { verifyFaqAction, rejectFaqAction } from "@/app/faq/[id]/actions";

interface Props {
  faqId: number;
  currentStatus: "draft" | "verified" | "rejected";
}

export function FaqVerifyControls({ faqId, currentStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handle(fn: (id: number) => Promise<void>) {
    return () => {
      setError(null);
      startTransition(async () => {
        try {
          await fn(faqId);
        } catch (e) {
          setError((e as Error).message);
        }
      });
    };
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {currentStatus === "verified"
          ? "This answer has been verified against the source playbook. Reset it back to draft if you want to re-review."
          : currentStatus === "rejected"
          ? "This answer has been rejected. Restore it to draft if you want to re-evaluate, or edit it below."
          : "Confirm this answer is accurate against the source playbook section, or reject it if the AI got it wrong."}
      </p>

      <div className="flex flex-wrap gap-2">
        {currentStatus !== "verified" && (
          <button
            type="button"
            disabled={pending}
            onClick={handle(verifyFaqAction)}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            {pending ? "Verifying…" : "Verify answer"}
          </button>
        )}
        {currentStatus !== "rejected" && (
          <button
            type="button"
            disabled={pending}
            onClick={handle(rejectFaqAction)}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 text-rose-700 px-4 py-2 text-sm font-medium hover:bg-rose-100 disabled:opacity-60 transition-colors"
          >
            <X className="h-4 w-4" />
            {pending ? "Rejecting…" : "Reject"}
          </button>
        )}
        {currentStatus !== "draft" && (
          <button
            type="button"
            disabled={pending}
            // Reverting works by going via reject then would need a "back to draft"
            // action. Simpler: reuse rejectFaqAction won't do it. For now we don't
            // expose a true "reset to draft" — editors can just re-verify if they
            // change their mind. Leave this as future work.
            onClick={() => setError("Reset-to-draft not implemented yet.")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:border-foreground/30 disabled:opacity-60 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to draft
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-600">Error: {error}</p>
      )}

      <p className="text-[11px] text-muted-foreground/70">
        Note: auth not wired yet — anyone visiting this page can verify or reject.
        Clerk-gated allowlist coming next.
      </p>
    </div>
  );
}
