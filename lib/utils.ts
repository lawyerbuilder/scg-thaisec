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
