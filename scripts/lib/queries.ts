// Taxonomy + ingestion-cursor data. Seeded into `regulation_types` by
// scripts/seed.ts and used by scripts/ingest.ts as the round-robin cursor
// over NRS buckets.

/**
 * Bilingual taxonomy of regulation categories — bootstrapped on `npm run seed`.
 * The slug is the stable identifier; the EN/TH names are what users see.
 * Document-type strings on the NRS list pages are mapped to these slugs by
 * `classifyDocumentType()` below.
 */
export interface RegulationTypeSeed {
  slug: string;
  nameEn: string;
  nameTh: string;
  category: string;
  descriptionEn?: string;
}

export const REGULATION_TYPES: RegulationTypeSeed[] = [
  {
    slug: "sec-notification",
    nameEn: "Notification of the SEC",
    nameTh: "ประกาศ ก.ล.ต.",
    category: "Notifications",
    descriptionEn:
      "Notifications issued by the Securities and Exchange Commission (SEC) office.",
  },
  {
    slug: "cmsb-notification",
    nameEn: "Notification of the Capital Market Supervisory Board",
    nameTh: "ประกาศคณะกรรมการกำกับตลาดทุน",
    category: "Notifications",
    descriptionEn:
      "Notifications issued by the Capital Market Supervisory Board (CMSB).",
  },
  {
    slug: "sec-board-notification",
    nameEn: "Notification of the SEC Board",
    nameTh: "ประกาศคณะกรรมการ ก.ล.ต.",
    category: "Notifications",
  },
  {
    slug: "mof-notification",
    nameEn: "Notification of the Ministry of Finance",
    nameTh: "ประกาศกระทรวงการคลัง",
    category: "Notifications",
  },
  {
    slug: "act",
    nameEn: "Act",
    nameTh: "พระราชบัญญัติ",
    category: "Primary law",
    descriptionEn: "Primary legislation enacted by the National Assembly.",
  },
  {
    slug: "royal-decree",
    nameEn: "Royal decree",
    nameTh: "พระราชกฤษฎีกา",
    category: "Primary law",
  },
  {
    slug: "royal-enactment",
    nameEn: "Royal enactment",
    nameTh: "พระราชกำหนด",
    category: "Primary law",
  },
  {
    slug: "ministerial-regulation",
    nameEn: "Ministerial regulation",
    nameTh: "กฎกระทรวง",
    category: "Subordinate law",
  },
  {
    slug: "guideline",
    nameEn: "Guideline",
    nameTh: "แนวปฏิบัติ",
    category: "Practice",
  },
  {
    slug: "form",
    nameEn: "Reporting form",
    nameTh: "แบบรายงาน",
    category: "Practice",
  },
  {
    slug: "other",
    nameEn: "Other",
    nameTh: "อื่นๆ",
    category: "Other",
  },
];

const TYPE_PATTERNS: Array<[RegExp, string]> = [
  [/notification of the capital market/i, "cmsb-notification"],
  [/ประกาศคณะกรรมการกำกับตลาดทุน/, "cmsb-notification"],
  [/notification of the (sec )?board/i, "sec-board-notification"],
  [/ประกาศคณะกรรมการ\s*ก\.?ล\.?ต/, "sec-board-notification"],
  [/notification of the sec/i, "sec-notification"],
  [/ประกาศ\s*สำนักงาน\s*ก\.?ล\.?ต/, "sec-notification"],
  [/notification of the ministry of finance/i, "mof-notification"],
  [/ประกาศกระทรวงการคลัง/, "mof-notification"],
  [/royal decree/i, "royal-decree"],
  [/พระราชกฤษฎีกา/, "royal-decree"],
  [/royal enactment/i, "royal-enactment"],
  [/พระราชกำหนด/, "royal-enactment"],
  [/\bact\b/i, "act"],
  [/พระราชบัญญัติ/, "act"],
  [/ministerial regulation/i, "ministerial-regulation"],
  [/กฎกระทรวง/, "ministerial-regulation"],
  [/guideline/i, "guideline"],
  [/แนวปฏิบัติ/, "guideline"],
  [/\bform\b/i, "form"],
  [/แบบ.*รายงาน/, "form"],
];

/**
 * Map a document-type string (either "Notification of the SEC" or
 * "ประกาศ ก.ล.ต.") to a taxonomy slug. Falls back to "other".
 */
export function classifyDocumentType(documentType: string | null | undefined): string {
  if (!documentType) return "other";
  for (const [re, slug] of TYPE_PATTERNS) {
    if (re.test(documentType)) return slug;
  }
  return "other";
}

/**
 * The NRS bucket IDs (`nrs_search_new.php?ref_id=N`) the ingestion script
 * walks through. Override with the INGEST_REF_IDS env var.
 *
 * The exact bucket → category mapping is opaque (the form is JS-rendered, so
 * we can't enumerate it via WebFetch). We start with 5 IDs that have been
 * observed live (ref_id=80 returned data during exploration) and expand
 * empirically. INGEST_MAX_DOCS caps the run.
 */
export const DEFAULT_REF_IDS = [80, 1, 2, 3, 4];
