"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function ConnectCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can fail in some browser contexts; ignore silently
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy"
      className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded border border-border bg-card hover:bg-muted px-2 py-1 text-[11px] text-muted-foreground transition-colors"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-600" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </button>
  );
}
