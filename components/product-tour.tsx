"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Upload,
  Sparkles,
  UserCheck,
  Search,
  MessageSquare,
  Compass,
  X,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

const TOUR_STORAGE_KEY = "scg-thaisec-tour-seen-v1";

interface TourStep {
  icon: React.ReactNode;
  badge: string;
  title: string;
  body: React.ReactNode;
  cta?: { label: string; href: string };
}

const STEPS: TourStep[] = [
  {
    icon: <Compass className="h-5 w-5" />,
    badge: "Welcome",
    title: "What this tool is for",
    body: (
      <>
        <strong>SCG ThaiSEC</strong> turns dense Thai SEC regulations and
        internal playbooks into verified, searchable Q&amp;A pairs your team
        can rely on. Source documents stay as references; the FAQs are the
        product.
      </>
    ),
  },
  {
    icon: <Upload className="h-5 w-5 text-foreground" />,
    badge: "Step 1",
    title: "Upload a source document",
    body: (
      <>
        Drop a PDF, DOCX, TXT, or MD file on the{" "}
        <strong>FAQ generator</strong> page. You can drop several at once —
        they process sequentially. Optionally pick a lawyer from the roster to
        assign the draft FAQs to for review.
      </>
    ),
    cta: { label: "Open the FAQ generator", href: "/upload" },
  },
  {
    icon: <Sparkles className="h-5 w-5 text-violet-600" />,
    badge: "Step 2",
    title: "AI drafts FAQs from the source",
    body: (
      <>
        The AI reads the document and writes 3-5 question/answer pairs in both
        Thai and English. Every answer is grounded only in the uploaded text —
        no invented facts. Each draft links back to its source for citation.
      </>
    ),
  },
  {
    icon: <UserCheck className="h-5 w-5 text-sky-600" />,
    badge: "Step 3",
    title: "Lawyer reviews and verifies",
    body: (
      <>
        Drafts appear in the assigned lawyer&apos;s queue. They can edit the
        wording, ask the AI to improve specific parts ("make it shorter",
        "cite มาตรา 100"), then click <strong>Verify</strong>. The system
        records who verified and when. After 1 year, a stale-warning appears
        prompting re-confirmation.
      </>
    ),
    cta: { label: "See the queue", href: "/faq?status=draft" },
  },
  {
    icon: <Search className="h-5 w-5 text-emerald-700" />,
    badge: "Step 4",
    title: "Anyone asks — gets verified answers",
    body: (
      <>
        Type a question in plain Thai or English on the <strong>FAQ</strong>{" "}
        page. The AI finds matching verified FAQs (or drafts a new answer for
        review if none exist). All search is semantic — &ldquo;online
        meeting&rdquo; finds the e-meeting FAQs even though the words
        don&apos;t match.
      </>
    ),
    cta: { label: "Try the FAQ", href: "/faq" },
  },
  {
    icon: <MessageSquare className="h-5 w-5 text-foreground" />,
    badge: "Bonus",
    title: "Use it from Claude or ChatGPT",
    body: (
      <>
        Connect this library to Claude.ai or ChatGPT once, then ask compliance
        questions from inside your normal AI chat — no copy-pasting documents.
        Step-by-step setup with copy buttons on every URL.
      </>
    ),
    cta: { label: "Setup instructions", href: "/connect" },
  },
];

export function ProductTour({ autoOpen = true }: { autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!autoOpen) return;
    try {
      const seen = window.localStorage.getItem(TOUR_STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      // localStorage might be blocked — fail silently, no tour
    }
  }, [autoOpen]);

  function close() {
    setOpen(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, new Date().toISOString());
    } catch {}
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else close();
  }

  function prev() {
    if (step > 0) setStep(step - 1);
  }

  // The button that the homepage renders to re-open the tour
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setStep(0);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Compass className="h-3.5 w-3.5" />
          Take the 1-minute tour
        </button>
      )}

      {open && (
        <TourOverlay
          step={step}
          stepData={STEPS[step]}
          totalSteps={STEPS.length}
          onClose={close}
          onNext={next}
          onPrev={prev}
          onGoTo={(i) => setStep(i)}
        />
      )}
    </>
  );
}

function TourOverlay({
  step,
  stepData,
  totalSteps,
  onClose,
  onNext,
  onPrev,
  onGoTo,
}: {
  step: number;
  stepData: TourStep;
  totalSteps: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onGoTo: (i: number) => void;
}) {
  // Esc to close, arrows to navigate
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrev]);

  const isLast = step === totalSteps - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-xl bg-card border border-border shadow-2xl">
        {/* Brand strip up top */}
        <div className="h-1 bg-primary rounded-t-xl" />

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tour"
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground p-1"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-muted">
              {stepData.icon}
            </span>
            <span className="eyebrow text-[10px]">{stepData.badge}</span>
          </div>

          <h2 className="text-xl font-semibold tracking-tight mb-2">
            {stepData.title}
          </h2>
          <p className="text-[14px] text-foreground/80 leading-relaxed">
            {stepData.body}
          </p>

          {stepData.cta && (
            <Link
              href={stepData.cta.href}
              onClick={onClose}
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-primary font-medium hover:underline"
            >
              {stepData.cta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {/* Progress dots */}
        <div className="px-6 sm:px-8 pb-3 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onGoTo(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-primary"
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              }`}
            />
          ))}
        </div>

        {/* Footer controls */}
        <div className="px-6 sm:px-8 pb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onPrev}
            disabled={step === 0}
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          <span className="text-[11px] text-muted-foreground tabular-nums">
            {step + 1} of {totalSteps}
          </span>

          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-[13px] font-medium hover:opacity-90"
          >
            {isLast ? "Finish" : "Next"}
            {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
