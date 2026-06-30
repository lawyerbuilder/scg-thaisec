import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  Upload,
  Sparkles,
  UserCheck,
  Search,
} from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { FavoritesGrid } from "@/components/favorites-grid";
import {
  listRegulationTypes,
  listSubjectCounts,
  getCorpusStats,
} from "@/lib/search";
import { countFaqs } from "@/lib/faqs";

export const revalidate = 300;

const POPULAR_QUERIES = [
  "digital asset",
  "asset management",
  "disclosure",
  "ประกาศ",
  "หลักทรัพย์",
  "trust",
  "fund manager",
  "ETF",
];

export default async function HomePage() {
  const [types, subjects, stats, faqTotal, faqVerified] = await Promise.all([
    listRegulationTypes().catch(() => []),
    listSubjectCounts().catch(() => []),
    getCorpusStats().catch(() => null),
    countFaqs().catch(() => 0),
    countFaqs({ status: "verified" }).catch(() => 0),
  ]);

  const topSubjects = subjects.slice(0, 8);

  return (
    <div className="container py-16 sm:py-24">
      <section className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground mb-7">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-foreground">SCG Legal</span>
          <span className="text-border">·</span>
          <span>Internal use only</span>
        </div>

        <h1 className="text-[2.5rem] sm:text-[3.25rem] font-semibold tracking-tight leading-[1.05] text-balance">
          Turn Thai regulations into verified FAQs your team can search.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground text-balance max-w-2xl mx-auto leading-relaxed">
          Upload a regulation, playbook, or any source document. The AI drafts
          Q&amp;A pairs grounded in the content and routes them to a lawyer for
          review. Verified answers join a searchable bilingual corpus —
          available here, in Claude, or in ChatGPT.
        </p>

        {/* Primary CTAs that mirror the workflow */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Upload className="h-4 w-4" /> Upload a document
          </Link>
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-2.5 text-sm font-medium hover:border-foreground/30 transition-colors"
          >
            <Sparkles className="h-4 w-4 text-violet-600" /> Ask the FAQ
          </Link>
          <Link
            href="/connect"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-2.5 text-sm font-medium hover:border-foreground/30 transition-colors"
          >
            From Claude or ChatGPT
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Counters */}
        <p className="mt-8 text-[12px] text-muted-foreground tabular-nums flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>
            <span className="font-semibold text-foreground">{stats?.totalRegulations ?? 0}</span> source documents
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="font-semibold text-foreground">{faqTotal}</span> drafted FAQs
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="font-semibold text-emerald-700">{faqVerified}</span> verified by lawyers
          </span>
        </p>
      </section>

      {/* HOW IT WORKS — explicit 4-step workflow */}
      <section className="mt-20 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="eyebrow mb-2">How it works</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            From a regulation PDF to a verified answer — in four steps.
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StepCard
            n={1}
            icon={<Upload className="h-4 w-4" />}
            title="Upload"
            body="Drop a PDF, DOCX, or text file — a Thai SEC regulation, an internal playbook, or any compliance source."
            href="/upload"
            cta="Open uploader"
          />
          <StepCard
            n={2}
            icon={<Sparkles className="h-4 w-4 text-violet-600" />}
            title="AI drafts FAQs"
            body="The model reads the document and generates 3-5 question/answer pairs in Thai and English, grounded only in the source — no invented facts."
          />
          <StepCard
            n={3}
            icon={<UserCheck className="h-4 w-4 text-sky-600" />}
            title="Lawyer reviews"
            body="Drafts route to the assigned lawyer's queue. They edit if needed, then Verify or Reject. Every action stamped with who + when for audit."
            href="/faq?status=draft"
            cta="See drafts in queue"
          />
          <StepCard
            n={4}
            icon={<Search className="h-4 w-4 text-emerald-700" />}
            title="Everyone asks"
            body="Verified FAQs become searchable — in this UI, via Claude/ChatGPT, or with the AI ask box. Answers cite the source regulation."
            href="/faq?status=verified"
            cta="Browse verified FAQs"
          />
        </div>
      </section>

      {/* Secondary search — for browsing the underlying regulation library */}
      <section className="mt-20 max-w-3xl mx-auto">
        <div className="text-center mb-5">
          <p className="eyebrow mb-2">Or browse the source library</p>
          <h2 className="text-xl font-semibold tracking-tight">
            Search regulations directly
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Skip the AI and jump straight to the underlying Thai SEC notifications
            and the SCG AGM playbook.
          </p>
        </div>
        <Suspense fallback={<div className="h-14 rounded-md border bg-card" />}>
          <SearchBar />
        </Suspense>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
          {POPULAR_QUERIES.map((q) => (
            <Link
              key={q}
              href={`/search?q=${encodeURIComponent(q)}`}
              className="rounded-full border border-border/70 bg-card px-3 py-1 text-muted-foreground hover:border-foreground/30 hover:text-foreground transition"
            >
              {q}
            </Link>
          ))}
        </div>
      </section>

      {topSubjects.length > 0 && (
        <section className="mt-24">
          <div className="flex items-baseline justify-between mb-7">
            <div>
              <p className="eyebrow mb-1">Subjects</p>
              <h2 className="text-xl font-semibold tracking-tight">Browse by subject</h2>
            </div>
            <Link
              href="/regulations"
              className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              See all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {topSubjects.map((s) => (
              <Link
                key={s.subject}
                href={`/regulations?subject=${encodeURIComponent(s.subject)}`}
                className="surface surface-hover p-4"
              >
                <div className="font-medium text-[15px] leading-snug">{s.subject}</div>
                <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                  {s.regulationCount.toLocaleString()}{" "}
                  {s.regulationCount === 1 ? "regulation" : "regulations"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {types.length > 0 && (
        <section className="mt-24">
          <div className="flex items-baseline justify-between mb-7">
            <div>
              <p className="eyebrow mb-1">Taxonomy</p>
              <h2 className="text-xl font-semibold tracking-tight">Browse by category</h2>
            </div>
            <Link
              href="/types"
              className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              See all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {types.slice(0, 12).map((t) => (
              <Link
                key={t.id}
                href={`/regulations?type=${t.slug}`}
                className="surface surface-hover p-4"
              >
                <div className="font-medium text-[15px] leading-snug">{t.nameEn}</div>
                <div className="mt-0.5 text-[12px] text-muted-foreground lang-th">{t.nameTh}</div>
                <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                  {t.regulationCount.toLocaleString()}{" "}
                  {t.regulationCount === 1 ? "regulation" : "regulations"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <FavoritesGrid limit={6} />

      {types.length === 0 && (
        <section className="mt-16 mx-auto max-w-2xl surface p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-2">No regulations yet.</p>
          <p>
            The database hasn&apos;t been seeded. Run{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5">npm run seed</code> to load the
            taxonomy, then{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5">npm run ingest</code> to pull
            regulations from capital.sec.or.th.
          </p>
        </section>
      )}
    </div>
  );
}

function StepCard({
  n,
  icon,
  title,
  body,
  href,
  cta,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  const content = (
    <div className="surface h-full p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-foreground text-background text-[11px] font-semibold tabular-nums">
          {n}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
          {icon}
          {title}
        </span>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed flex-1">
        {body}
      </p>
      {cta && href && (
        <span className="mt-3 text-[12px] text-primary font-medium inline-flex items-center gap-1">
          {cta}
          <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-95 transition-opacity">
      {content}
    </Link>
  ) : (
    content
  );
}
