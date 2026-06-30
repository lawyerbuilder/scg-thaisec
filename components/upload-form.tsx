"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  FileCheck2,
  AlertCircle,
  X,
  FileText,
  Clock,
} from "lucide-react";
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

type FileStatus =
  | { kind: "pending" }
  | { kind: "uploading" }
  | { kind: "done"; result: UploadResponse }
  | { kind: "error"; message: string };

interface QueueItem {
  id: string;
  file: File;
  status: FileStatus;
}

export function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [skipFaqs, setSkipFaqs] = useState(false);
  const [running, setRunning] = useState(false);
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
        setLawyers((json.lawyers ?? []) as LawyerOption[]);
      } catch {
        // empty dropdown — user can still proceed
      } finally {
        if (!cancelled) setLawyersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function addFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming);
    const items: QueueItem[] = arr.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      file: f,
      status: { kind: "pending" },
    }));
    setQueue((prev) => [...prev, ...items]);
  }

  function removeItem(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  function patchItem(id: string, status: FileStatus) {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
  }

  async function processOne(item: QueueItem): Promise<void> {
    patchItem(item.id, { kind: "uploading" });
    const formData = new FormData();
    formData.append("file", item.file);
    if (assignedTo.trim()) formData.append("assignedTo", assignedTo.trim());
    if (skipFaqs) formData.append("skipFaqs", "true");

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = (await res.json()) as UploadResponse | { error: string };
      if (!res.ok) {
        patchItem(item.id, {
          kind: "error",
          message: "error" in json ? json.error : `HTTP ${res.status}`,
        });
      } else {
        patchItem(item.id, { kind: "done", result: json as UploadResponse });
      }
    } catch (err) {
      patchItem(item.id, { kind: "error", message: (err as Error).message });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pending = queue.filter((q) => q.status.kind === "pending");
    if (pending.length === 0 || running) return;
    setRunning(true);
    // Sequential — keeps server load + Groq rate limits sane. For parallel
    // upload at higher scale we'd switch to a small p-limit pool.
    for (const item of pending) {
      // eslint-disable-next-line no-await-in-loop
      await processOne(item);
    }
    setRunning(false);
    router.refresh();
  }

  function clearAll() {
    setQueue([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const pendingCount = queue.filter((q) => q.status.kind === "pending").length;
  const doneCount = queue.filter((q) => q.status.kind === "done").length;
  const errorCount = queue.filter((q) => q.status.kind === "error").length;
  const totalFaqs = queue.reduce(
    (sum, q) =>
      q.status.kind === "done" ? sum + q.status.result.faqsGenerated : sum,
    0
  );

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
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
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
          Drop one or more files, or click to browse
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Supports: {SUPPORTED_EXTENSIONS.join(", ")} · max 10 MB each · processed sequentially
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={SUPPORTED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
          }}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border text-[12px]">
            <span className="font-medium tabular-nums">
              {queue.length} file{queue.length === 1 ? "" : "s"} ·{" "}
              {pendingCount} pending · {doneCount} done · {errorCount} failed
            </span>
            <button
              type="button"
              onClick={clearAll}
              disabled={running}
              className="text-muted-foreground hover:text-foreground text-[12px] disabled:opacity-50"
            >
              Clear all
            </button>
          </div>
          <ul className="divide-y divide-border">
            {queue.map((item) => (
              <QueueRow key={item.id} item={item} onRemove={() => removeItem(item.id)} disabled={running} />
            ))}
          </ul>
        </div>
      )}

      {/* Assign to */}
      <label className="block">
        <span className="eyebrow text-[10px] mb-1.5 block">
          Assign FAQs to (applies to ALL files in this batch — optional)
        </span>
        {lawyersLoading ? (
          <div className="h-10 px-3 rounded-md border border-border bg-card text-[14px] inline-flex items-center text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Loading roster…
          </div>
        ) : lawyers.length > 0 ? (
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={running}
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
          Roster managed at{" "}
          <Link href="/admin/lawyers" className="text-primary hover:underline">
            /admin/lawyers
          </Link>
          . Email notification sent when generation finishes (requires{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">RESEND_API_KEY</code>).
        </span>
      </label>

      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          checked={skipFaqs}
          onChange={(e) => setSkipFaqs(e.target.checked)}
          disabled={running}
          className="h-4 w-4 rounded border-border"
        />
        Skip auto-generating FAQs (just store the documents as sources)
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pendingCount === 0 || running}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Processing {pendingCount} remaining…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {pendingCount === 0
                ? "Nothing pending"
                : `Process ${pendingCount} file${pendingCount === 1 ? "" : "s"}`}
            </>
          )}
        </button>
        {running && (
          <span className="text-[11px] text-muted-foreground">
            Each file ~10-30s. Don&apos;t close the tab.
          </span>
        )}
        {!running && doneCount > 0 && (
          <span className="text-[12px] text-emerald-700">
            ✨ {totalFaqs} draft FAQs generated across {doneCount} file
            {doneCount === 1 ? "" : "s"}.{" "}
            <Link
              href="/faq?source=ai_generated&status=draft"
              className="underline underline-offset-2 hover:no-underline"
            >
              View them →
            </Link>
          </span>
        )}
      </div>
    </form>
  );
}

function QueueRow({
  item,
  onRemove,
  disabled,
}: {
  item: QueueItem;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { status, file } = item;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="truncate font-medium">{file.name}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {(file.size / 1024).toFixed(1)} KB
          </span>
        </div>
        <div className="text-[11px]">
          <StatusLabel status={status} />
        </div>
      </div>
      {status.kind === "pending" && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove from queue"
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function StatusLabel({ status }: { status: FileStatus }) {
  if (status.kind === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
  }
  if (status.kind === "uploading") {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <Loader2 className="h-3 w-3 animate-spin" /> Uploading + generating FAQs…
      </span>
    );
  }
  if (status.kind === "done") {
    const r = status.result;
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <FileCheck2 className="h-3 w-3" />
        Done — {r.chars.toLocaleString()} chars
        {r.pageCount && ` · ${r.pageCount} pages`}
        {r.faqsGenerated > 0 && ` · ${r.faqsGenerated} draft FAQs`}
        {r.faqError && (
          <span className="ml-1 text-amber-700">(FAQ gen failed: {r.faqError})</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-rose-700">
      <AlertCircle className="h-3 w-3" /> Failed — {status.message}
    </span>
  );
}
