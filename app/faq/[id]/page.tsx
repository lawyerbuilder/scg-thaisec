import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, FileQuestion, Sparkles, AlertCircle, ArrowLeft, ExternalLink } from "lucide-react";
import { getFaqById, type FaqDetail } from "@/lib/faqs";
import { MarkdownBody } from "@/components/markdown-body";
import { FaqVerifyControls } from "@/components/faq-verify-controls";
import { FaqEditForm } from "@/components/faq-edit-form";

export const dynamic = "force-dynamic";

export default async function FaqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) notFound();

  const faq = await getFaqById(id).catch(() => null);
  if (!faq) notFound();

  return (
    <div className="container py-10 max-w-3xl">
      <Link
        href="/faq"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All FAQs
      </Link>

      {/* Status & metadata strip */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-[11px]">
        <StatusBadge status={faq.status} />
        <SourceBadge source={faq.source} />
        {faq.topic && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            {faq.topic}
          </span>
        )}
        {faq.model && (
          <span className="text-muted-foreground tabular-nums">
            {faq.model}
          </span>
        )}
        {faq.verifiedAt && (
          <span className="text-muted-foreground tabular-nums">
            verified {faq.verifiedAt.slice(0, 10)}
            {faq.verifiedBy && ` by ${faq.verifiedBy}`}
          </span>
        )}
      </div>

      {/* Question */}
      <h1 className="text-2xl font-semibold tracking-tight leading-snug">
        {faq.questionEn ?? faq.questionTh}
      </h1>
      {faq.questionEn && faq.questionTh && faq.questionEn !== faq.questionTh && (
        <p className="mt-2 text-base text-muted-foreground lang-th leading-snug">
          {faq.questionTh}
        </p>
      )}

      {/* Source link back to playbook section */}
      {faq.regulationId && faq.regulationPlaybookSlug && (
        <Link
          href={`/regulations/${faq.regulationId}`}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
        >
          Grounded in §{faq.regulationPlaybookSlug.replace("pb-", "")} —{" "}
          {faq.regulationTitleEn ?? faq.regulationTitleTh}
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}

      {/* Answers */}
      <div className="mt-8 space-y-5">
        {faq.answerEn && (
          <section className="surface p-6">
            <p className="eyebrow mb-3">Answer · English</p>
            <MarkdownBody source={faq.answerEn} />
          </section>
        )}
        {faq.answerTh && (
          <section className="surface p-6">
            <p className="eyebrow mb-3">Answer · Thai</p>
            <MarkdownBody source={faq.answerTh} isThai />
          </section>
        )}
      </div>

      {/* Verify / reject controls */}
      <section className="mt-8 surface p-6">
        <p className="eyebrow mb-3">Reviewer actions</p>
        <FaqVerifyControls
          faqId={faq.id}
          currentStatus={faq.status}
        />
      </section>

      {/* Edit form */}
      <section className="mt-8 surface p-6">
        <p className="eyebrow mb-3">Edit answer</p>
        <FaqEditForm faq={toEditableFaq(faq)} />
      </section>
    </div>
  );
}

function toEditableFaq(f: FaqDetail) {
  return {
    id: f.id,
    questionTh: f.questionTh,
    questionEn: f.questionEn ?? "",
    answerTh: f.answerTh,
    answerEn: f.answerEn ?? "",
    topic: f.topic ?? "",
  };
}

function StatusBadge({ status }: { status: FaqDetail["status"] }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5">
        <AlertCircle className="h-3 w-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5">
      <FileQuestion className="h-3 w-3" /> Draft
    </span>
  );
}

function SourceBadge({ source }: { source: FaqDetail["source"] }) {
  if (source === "ai_generated") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-0.5">
        <Sparkles className="h-3 w-3" /> AI-generated
      </span>
    );
  }
  if (source === "imported") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-0.5">
        Imported
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2.5 py-0.5">
      Manual
    </span>
  );
}
