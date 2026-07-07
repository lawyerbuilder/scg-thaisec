import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncate(s: string, max = 240): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

const EN_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const TH_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * Format an ISO date string or Date as `DD Mon YYYY` (en) or with Thai months + พ.ศ. year (th).
 * Returns "—" for null/undefined/invalid input so callers can render unconditionally.
 */
export function formatDate(value: Date | string | null | undefined, locale: "en" | "th" = "en"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const m = d.getUTCMonth();
  const yearAD = d.getUTCFullYear();
  if (locale === "th") {
    return `${day} ${TH_MONTHS[m]} ${yearAD + 543}`;
  }
  return `${day} ${EN_MONTHS[m]} ${yearAD}`;
}

/** True if the string contains any Thai-script codepoint. Used to pick search strategy. */
export function containsThai(s: string): boolean {
  return /[฀-๿]/.test(s);
}

/** Escape the five HTML metacharacters so a string is inert as HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Make a Postgres FTS snippet safe to render as HTML.
 *
 * `ts_headline` wraps matches in literal <mark>…</mark> but does NOT escape the
 * surrounding body text — and regulation bodies are writable (the MCP upload
 * tool), so a crafted `<img onerror=…>` in a body would otherwise execute in a
 * reader's browser straight from the search results. We escape everything,
 * then re-enable ONLY the exact <mark>/</mark> highlight tags ts_headline
 * inserts. Any other markup — including <mark> with attributes — stays inert.
 */
export function highlightSnippetHtml(raw: string): string {
  return escapeHtml(raw)
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

/**
 * FAQs lose accuracy as the underlying regulations evolve. Verified content
 * older than this threshold gets a "may be stale" warning on the UI so users
 * don't blindly trust a 3-year-old answer.
 */
export const FAQ_STALENESS_THRESHOLD_DAYS = 365;

/**
 * Returns the staleness state for an FAQ:
 *   - "fresh"   verified within the threshold
 *   - "stale"   verified but past the threshold — show warning
 *   - "unverified"  never verified (no verified_at)
 */
export function faqStaleness(
  verifiedAt: string | null | undefined,
  now: Date = new Date()
): { state: "fresh" | "stale" | "unverified"; ageDays: number | null } {
  if (!verifiedAt) return { state: "unverified", ageDays: null };
  const verified = new Date(verifiedAt);
  if (Number.isNaN(verified.getTime())) return { state: "unverified", ageDays: null };
  const ageMs = now.getTime() - verified.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  return {
    state: ageDays > FAQ_STALENESS_THRESHOLD_DAYS ? "stale" : "fresh",
    ageDays,
  };
}
