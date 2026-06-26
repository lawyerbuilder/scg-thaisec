import Link from "next/link";
import { listFaqs, listFaqTopics, countFaqs, type FaqListRow } from "@/lib/faqs";
import { truncate } from "@/lib/utils";
import { CheckCircle2, FileQuestion, Sparkles, AlertCircle, Search } from "lucide-react";
import { FaqAskForm } from "@/components/faq-ask-form";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  topic?: string;
  status?: "draft" | "verified" | "rejected" | "all";
  source?: "imported" | "ai_generated" | "manual" | "all";
}

export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const status = params.status ?? "all";
  const source = params.source ?? "all";
  const topic = params.topic ?? "";

  const [faqs, topics, totals] = await Promise.all([
    listFaqs({
      query: query || undefined,
      status,
      topic: topic || undefined,
      source,
      limit: 100,
    }).catch(() => [] as FaqListRow[]),
    listFaqTopics().catch(() => [] as { topic: string; count: number }[]),
    Promise.all([
      countFaqs(),
      countFaqs({ status: "verified" }),
      countFaqs({ status: "draft" }),
    ]).then(([all, verified, draft]) => ({ all, verified, draft })),
  ]);

  return (
    <div className="container py-10 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow">FAQ</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">
            Frequently asked questions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {totals.all} total · {totals.verified} verified · {totals.draft} draft
          </p>
        </div>
        <p className="text-xs text-muted-foreground max-w-sm">
          AI-drafted questions grounded in the AGM Compliance Playbook. SCG Legal
          reviewers can verify or edit answers below.
        </p>
      </div>

      {/* AI ask box — primary entry point. */}
      <section className="mb-6 surface p-5">
        <FaqAskForm />
      </section>

      {/* Keyword search + filter chips for browsing */}
      <form action="/faq" method="get" className="mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Or keyword-search the existing FAQs — quorum, ลงคะแนน, dividend, proxy"
            className="w-full h-11 pl-10 pr-3 rounded-md border border-border bg-card text-[14px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          {source !== "all" && <input type="hidden" name="source" value={source} />}
          {topic && <input type="hidden" name="topic" value={topic} />}
        </div>
      </form>

      {/* Filter chips */}
      <div className="mb-6 flex flex-wrap gap-2 text-[12px]">
        <FilterChip
          label={`All (${totals.all})`}
          href={buildHref({ ...params, status: "all" })}
          active={status === "all"}
        />
        <FilterChip
          label={`Verified (${totals.verified})`}
          href={buildHref({ ...params, status: "verified" })}
          active={status === "verified"}
        />
        <FilterChip
          label={`Draft (${totals.draft})`}
          href={buildHref({ ...params, status: "draft" })}
          active={status === "draft"}
        />
        {topics.length > 0 && <span className="text-muted-foreground/40 px-1">·</span>}
        {topics.slice(0, 10).map((t) => (
          <FilterChip
            key={t.topic}
            label={`${t.topic} (${t.count})`}
            href={buildHref({ ...params, topic: topic === t.topic ? "" : t.topic })}
            active={topic === t.topic}
          />
        ))}
      </div>

      {/* Results */}
      {faqs.length === 0 ? (
        <EmptyState query={query} hasAnyData={totals.all > 0} />
      ) : (
        <div className="space-y-3">
          {faqs.map((f) => (
            <FaqRow key={f.id} faq={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-foreground text-background px-3 py-1 tabular-nums"
          : "rounded-full border border-border bg-card hover:border-foreground/40 px-3 py-1 text-muted-foreground tabular-nums transition-colors"
      }
    >
      {label}
    </Link>
  );
}

function FaqRow({ faq }: { faq: FaqListRow }) {
  return (
    <Link
      href={`/faq/${faq.id}`}
      className="block surface surface-hover p-5 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5 text-[11px]">
            <StatusBadge status={faq.status} />
            <SourceBadge source={faq.source} />
            {faq.topic && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {faq.topic}
              </span>
            )}
            {faq.regulationPlaybookSlug && (
              <span className="text-muted-foreground tabular-nums">
                from {faq.regulationPlaybookSlug.replace("pb-", "§ ")}
              </span>
            )}
          </div>
          <h3 className="text-[15px] font-medium leading-snug">
            {faq.questionEn ?? faq.questionTh}
          </h3>
          {faq.questionEn && (
            <p className="mt-0.5 text-[13px] text-muted-foreground lang-th leading-snug">
              {faq.questionTh}
            </p>
          )}
          <p className="mt-2 text-[13px] text-foreground/75 line-clamp-2">
            {truncate(faq.answerEn ?? faq.answerTh, 240)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: FaqListRow["status"] }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5">
        <AlertCircle className="h-3 w-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5">
      <FileQuestion className="h-3 w-3" /> Draft
    </span>
  );
}

function SourceBadge({ source }: { source: FaqListRow["source"] }) {
  if (source === "ai_generated") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5">
        <Sparkles className="h-3 w-3" /> AI
      </span>
    );
  }
  if (source === "imported") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5">
        Imported
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5">
      Manual
    </span>
  );
}

function EmptyState({ query, hasAnyData }: { query: string; hasAnyData: boolean }) {
  if (!hasAnyData) {
    return (
      <div className="mt-10 surface p-10 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-2">No FAQs yet</p>
        <p>
          Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">
            npm run generate:faqs
          </code>{" "}
          to populate from the AGM playbook.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-10 surface p-10 text-center text-sm text-muted-foreground">
      No FAQs match{query && <span> &ldquo;{query}&rdquo;</span>}. Try clearing filters
      or searching for a different term.
    </div>
  );
}

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== "all") sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `/faq?${q}` : "/faq";
}
