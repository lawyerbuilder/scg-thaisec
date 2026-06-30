"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileCheck2, AlertCircle } from "lucide-react";
import { SUPPORTED_EXTENSIONS } from "@/lib/parse-document";

interface LawyerOption {
  id: number;
  email: string;
  name: string;
}

interface UploadResponse {
  regulationId: number;
  title: string;
  bytes: number;
  chars: number;
  pageCount: number | null;
  faqsGenerated: number;
  faqIds: number[];
  faqError: string | null;
}

export function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [skipFaqs, setSkipFaqs] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lawyers, setLawyers] = useState<LawyerOption[]>([]);
  const [lawyersLoading, setLawyersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/lawyers?active=1");
        const json = await res.json();
        if (cancelled) return;
        const list = (json.lawyers ?? []) as LawyerOption[];
        setLawyers(list);
      } catch {
        // dropdown will be empty; user can still type or visit /admin/lawyers
      } finally {
        if (!cancelled) setLawyersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleFileChange(f: File | null) {
    setFile(f);
    setError(null);
    setResult(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || pending) return;
    setError(null);
    setResult(null);
    setPending(true);

    const formData = new FormData();
    formData.append("file", file);
    if (title.trim()) formData.append("title", title.trim());
    if (assignedTo.trim()) formData.append("assignedTo", assignedTo.trim());
    if (skipFaqs) formData.append("skipFaqs", "true");

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = (await res.json()) as UploadResponse | { error: string };
      if (!res.ok) {
        setError("error" in json ? json.error : `HTTP ${res.status}`);
      } else {
        setResult(json as UploadResponse);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) handleFileChange(dropped);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed cursor-pointer transition-colors p-10 text-center ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-foreground/30"
        }`}
      >
        <Upload className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">
          {file ? file.name : "Drop a file here or click to browse"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Supports: {SUPPORTED_EXTENSIONS.join(", ")} · max 10 MB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* Optional title override */}
      <label className="block">
        <span className="eyebrow text-[10px] mb-1.5 block">
          Title (optional — defaults to filename)
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. AGM Quorum Requirements Update 2025"
          className="w-full h-10 px-3 rounded-md border border-border bg-card text-[14px]"
        />
      </label>

      {/* Assign to a lawyer from the managed roster */}
      <label className="block">
        <span className="eyebrow text-[10px] mb-1.5 block">
          Assign FAQs to (optional)
        </span>
        {lawyersLoading ? (
          <div className="h-10 px-3 rounded-md border border-border bg-card text-[14px] inline-flex items-center text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Loading roster…
          </div>
        ) : lawyers.length > 0 ? (
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-border bg-card text-[14px]"
          >
            <option value="">— No one (leave unassigned) —</option>
            {lawyers.map((l) => (
              <option key={l.id} value={l.email}>
                {l.name} ({l.email})
              </option>
            ))}
          </select>
        ) : (
          <div className="h-10 px-3 rounded-md border border-border bg-card text-[13px] inline-flex items-center text-muted-foreground">
            No lawyers in the roster yet —{" "}
            <Link
              href="/admin/lawyers"
              className="ml-1 text-primary underline underline-offset-2 hover:no-underline"
            >
              add one
            </Link>
            .
          </div>
        )}
        <span className="mt-1 block text-[11px] text-muted-foreground">
          The selected lawyer will see these drafts as their queue on{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">/faq?assignee=…</code>.
          Roster is managed at{" "}
          <Link href="/admin/lawyers" className="text-primary hover:underline">
            /admin/lawyers
          </Link>
          .
        </span>
      </label>

      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          checked={skipFaqs}
          onChange={(e) => setSkipFaqs(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Skip auto-generating FAQs (just store the document)
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!file || pending}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {skipFaqs ? "Uploading…" : "Uploading + generating FAQs…"}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload & generate
            </>
          )}
        </button>
        {pending && (
          <span className="text-[11px] text-muted-foreground">
            FAQ generation can take 10-30s
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Upload failed</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900 space-y-2">
          <div className="flex items-start gap-2">
            <FileCheck2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-medium">Uploaded successfully</p>
              <p className="mt-0.5 tabular-nums">
                {result.title} · {(result.bytes / 1024).toFixed(1)} KB ·{" "}
                {result.chars.toLocaleString()} chars
                {result.pageCount && ` · ${result.pageCount} pages`}
              </p>
            </div>
          </div>
          {result.faqsGenerated > 0 && (
            <p>
              ✨ Generated <strong>{result.faqsGenerated}</strong> draft FAQs.{" "}
              <button
                type="button"
                onClick={() => router.push(`/faq?source=ai_generated&status=draft`)}
                className="underline underline-offset-2 hover:no-underline"
              >
                View them →
              </button>
            </p>
          )}
          {result.faqError && (
            <p className="text-amber-800">
              FAQ generation failed: {result.faqError} — document is saved, you can
              re-try generation later with{" "}
              <code className="rounded bg-emerald-100 px-1 py-0.5 text-[11px]">
                npm run generate:faqs
              </code>
              .
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setTitle("");
              setResult(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="text-[12px] underline underline-offset-2 hover:no-underline"
          >
            Upload another
          </button>
        </div>
      )}
    </form>
  );
}
