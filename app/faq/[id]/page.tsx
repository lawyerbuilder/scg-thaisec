import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, FileQuestion, Sparkles, AlertCircle, ArrowLeft, ExternalLink, Clock, UserCheck } from "lucide-react";
import { getFaqById, type FaqDetail } from "@/lib/faqs";
import { faqStaleness, FAQ_STALENESS_THRESHOLD_DAYS } from "@/lib/utils";
import { FaqVerifyControls } from "@/components/faq-verify-controls";
import { FaqEditForm } from "@/components/faq-edit-form";
import { LocalizedText } from "@/components/localized-text";
import { LocalizedBody } from "@/components/localized-body";

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
      </div>

      {/* Audit trail — assignment & verification */}
      <AuditStrip faq={faq} />

      {/* Staleness warning — verified FAQs older than 1 year */}
      <StalenessBanner verifiedAt={faq.verifiedAt} status={faq.status} />

      {/* Question — primary in preferred locale, secondary in the other */}
      <LocalizedText
        as="div"
        en={faq.questionEn}
        th={faq.questionTh}
        className="text-2xl font-semibold tracking-tight leading-snug"
      />
      {faq.questionEn && faq.questionTh && faq.questionEn !== faq.questionTh && (
        <LocalizedText
          as="p"
          // Cross-reference line: shows the OTHER language
          en={faq.questionTh}
          th={faq.questionEn}
          className="mt-2 text-base text-muted-foreground leading-snug"
        />
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

      {/* Answer — locale-aware. Defaults to the preferred language, with a
          "Show both" toggle for cross-reference. */}
      <div className="mt-8">
        <LocalizedBody bodyEn={faq.answerEn ?? ""} bodyTh={faq.answerTh ?? ""} />
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

function AuditStrip({ faq }: { faq: FaqDetail }) {
  const hasAnything = faq.assignedTo || faq.verifiedAt || faq.verifiedBy;
  if (!hasAnything) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-2.5 text-[12px]">
      {faq.assignedTo && faq.status !== "verified" && (
        <span className="inline-flex items-center gap-1.5 text-sky-700">
          <UserCheck className="h-3.5 w-3.5" />
          Assigned to{" "}
          <Link
            href={`/faq?assignee=${encodeURIComponent(faq.assignedTo)}`}
            className="font-medium hover:underline underline-offset-2"
          >
            {faq.assignedTo}
          </Link>
        </span>
      )}
      {faq.verifiedAt && (
        <span className="inline-flex items-center gap-1.5 text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Verified{" "}
          <span className="tabular-nums">{faq.verifiedAt.slice(0, 10)}</span>
          {faq.verifiedBy && (
            <>
              {" "}by <span className="font-medium">{faq.verifiedBy}</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

function StalenessBanner({
  verifiedAt,
  status,
}: {
  verifiedAt: string | null;
  status: FaqDetail["status"];
}) {
  if (status !== "verified") return null;
  const s = faqStaleness(verifiedAt);
  if (s.state !== "stale") return null;
  return (
    <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 flex items-start gap-2">
      <Clock className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
      <div>
        <p className="font-medium">This answer may be stale</p>
        <p className="mt-0.5">
          It was verified {s.ageDays} days ago — over the{" "}
          {FAQ_STALENESS_THRESHOLD_DAYS}-day freshness threshold. Thai SEC
          regulations may have changed since. A reviewer should re-confirm the
          answer is still accurate against the latest source playbook.
        </p>
      </div>
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
