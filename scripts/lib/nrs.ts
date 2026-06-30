import * as cheerio from "cheerio";

const NRS_BASE = "https://capital.sec.or.th/webapp/nrs/nrs_search_new.php";
const PDF_BASE = "https://publish.sec.or.th/nrs";

const DEFAULT_UA =
  process.env.INGEST_USER_AGENT ??
  "Mozilla/5.0 (compatible; SCGThaiSECBot/0.1; +https://scg-thaisec.vercel.app)";

export interface ScrapedRow {
  docId: number;
  refId: number;
  titleTh: string;
  documentType: string | null;
  publicationDate: string | null;
  effectiveDate: string | null;
  status: string | null;
  pdfUrl: string;
  pdfTextUrl: string;
  docUrl: string;
  sourceUrl: string;
  regNumber: string | null;
}

/**
 * Parse a Thai date string like "1 มกราคม 2566" into ISO YYYY-MM-DD (the AD year).
 * Returns null if it can't parse. Handles both Thai and short EN formats.
 */
export function parseThaiDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const THAI_MONTHS: Record<string, number> = {
    "มกราคม": 0, "มกร": 0, "ม.ค.": 0,
    "กุมภาพันธ์": 1, "กุมภ": 1, "ก.พ.": 1,
    "มีนาคม": 2, "มี.ค.": 2,
    "เมษายน": 3, "เม.ย.": 3,
    "พฤษภาคม": 4, "พ.ค.": 4,
    "มิถุนายน": 5, "มิ.ย.": 5,
    "กรกฎาคม": 6, "ก.ค.": 6,
    "สิงหาคม": 7, "ส.ค.": 7,
    "กันยายน": 8, "ก.ย.": 8,
    "ตุลาคม": 9, "ต.ค.": 9,
    "พฤศจิกายน": 10, "พ.ย.": 10,
    "ธันวาคม": 11, "ธ.ค.": 11,
  };
  const parts = s.split(/[\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const day = Number(parts[0]);
  const monKey = Object.keys(THAI_MONTHS).find((k) => parts[1].includes(k));
  if (!Number.isFinite(day) || !monKey) return null;
  const month = THAI_MONTHS[monKey];
  let year = Number(parts[parts.length - 1]);
  if (!Number.isFinite(year)) return null;
  // Thai dates use Buddhist Era (พ.ศ.) — convert to AD if year > 2400.
  if (year > 2400) year -= 543;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Pull a single doc_id out of an `href` like `publish.sec.or.th/nrs/12345s.pdf`
 * or `publish.sec.or.th/nrs/12345p_r.pdf`. Returns null if no match.
 */
function extractDocId(href: string | undefined): number | null {
  if (!href) return null;
  const m = href.match(/\/(\d+)(?:s|p_r|p)\.(pdf|doc)/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

const STATUS_MAP: Array<[RegExp, string]> = [
  [/in\s*use|currently/i, "in_force"],
  [/ใช้บังคับ|มีผลใช้|ปัจจุบัน/, "in_force"],
  [/on\s*process|in\s*process/i, "on_process"],
  [/กำลังดำเนินการ/, "on_process"],
  [/repeal|cancel/i, "repealed"],
  [/ยกเลิก/, "repealed"],
];

function classifyStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [re, val] of STATUS_MAP) if (re.test(raw)) return val;
  return null;
}

/**
 * Parse "ประกาศคณะกรรมการ ก.ล.ต. เลขที่ 1/2555" → "1/2555".
 * Returns null if no number is found.
 */
function extractRegNumber(title: string): string | null {
  const m = title.match(/(?:เลขที่|No\.?)\s*(\d{1,4}\s*\/\s*\d{2,4})/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, "");
}

export async function fetchRefIdBucket(refId: number): Promise<ScrapedRow[]> {
  const sourceUrl = `${NRS_BASE}?ref_id=${refId}`;
  const res = await fetch(sourceUrl, {
    headers: {
      "User-Agent": DEFAULT_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "th,en;q=0.7",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`NRS bucket ${refId} returned HTTP ${res.status}`);
  }
  const html = await decodeWithCorrectEncoding(res);
  const $ = cheerio.load(html);

  const rows: ScrapedRow[] = [];
  $("table tr").each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.find("td").toArray().map((c) => $(c).text().trim());
    if (cells.length < 3) return;

    let docId: number | null = null;
    $tr.find("a[href]").each((_, a) => {
      if (docId !== null) return;
      const id = extractDocId($(a).attr("href"));
      if (id !== null) docId = id;
    });
    if (docId === null) return;

    const title = cells.find((c) => c && c.length > 12) ?? cells[1] ?? "";
    if (!title) return;

    const documentType = cells.find((c) =>
      /(notification|ประกาศ|royal|act|พระราช|กฎกระทรวง|guideline|แนวปฏิบัติ)/i.test(c)
    ) ?? null;
    const dateCells = cells.filter((c) => /\d{2,4}/.test(c) && /[A-Za-zก-๛]/.test(c));
    const publicationDate = parseThaiDate(dateCells[0]);
    const effectiveDate = parseThaiDate(dateCells[1] ?? null);
    const statusCell = cells.find((c) =>
      /(in use|on process|cancel|repeal|ใช้บังคับ|ปัจจุบัน|ยกเลิก|ดำเนินการ)/i.test(c)
    ) ?? null;

    rows.push({
      docId,
      refId,
      titleTh: title,
      documentType,
      publicationDate,
      effectiveDate,
      status: classifyStatus(statusCell),
      pdfUrl: `${PDF_BASE}/${docId}s.pdf`,
      pdfTextUrl: `${PDF_BASE}/${docId}p_r.pdf`,
      docUrl: `${PDF_BASE}/${docId}p.doc`,
      sourceUrl,
      regNumber: extractRegNumber(title),
    });
  });

  // Dedup within a single page — defensive; NRS sometimes repeats rows.
  const seen = new Set<number>();
  return rows.filter((r) => {
    if (seen.has(r.docId)) return false;
    seen.add(r.docId);
    return true;
  });
}

/**
 * The Thai SEC NRS portal serves HTML in Windows-874 / TIS-620 (the legacy
 * Thai charset), NOT UTF-8. `res.text()` would decode as UTF-8 by default and
 * mangle every Thai byte into `�`. We read raw bytes, sniff the encoding from
 * the HTTP Content-Type header and the HTML `<meta charset>` tag, then decode
 * with the right TextDecoder. Falls back to windows-874 when no hint is found
 * (true for NRS today — they don't declare a charset).
 */
async function decodeWithCorrectEncoding(res: Response): Promise<string> {
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let charset: string | undefined;

  // 1) HTTP header hint
  const contentType = res.headers.get("content-type") ?? "";
  const headerMatch = contentType.match(/charset=([^;\s]+)/i);
  if (headerMatch) charset = headerMatch[1].trim().toLowerCase();

  // 2) <meta charset="..."> or <meta http-equiv="Content-Type" content="...">
  if (!charset) {
    const head = new TextDecoder("ascii").decode(bytes.slice(0, 2048));
    const metaCharset =
      head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
      head.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s]+)/i)?.[1];
    if (metaCharset) charset = metaCharset.trim().toLowerCase();
  }

  // 3) Fallback for Thai SEC NRS — empirically windows-874
  if (!charset) charset = "windows-874";

  // Aliases that TextDecoder doesn't accept directly
  if (charset === "tis-620" || charset === "iso-8859-11") charset = "windows-874";

  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    // Last-ditch: TextDecoder doesn't know the label — try UTF-8 and accept mojibake
    return new TextDecoder("utf-8").decode(bytes);
  }
}
