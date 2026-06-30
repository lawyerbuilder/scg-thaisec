/**
 * Repairs existing sec_nrs regulations:
 *   1. Re-fetches the source pages, picks up the REAL hrefs from the HTML
 *      (more accurate than our synthesized URL template).
 *   2. HEAD-checks every URL. Nulls out any that return non-2xx OR a
 *      suspiciously small file (< 1KB — these are placeholder blobs that
 *      look "live" but contain nothing).
 *   3. Re-attempts body extraction for any row with an empty body.
 *   4. After the pass, deletes rows that have NO working URLs AND no body —
 *      they're useless metadata-only entries pointing at vanished content.
 *
 * Idempotent. Safe to run multiple times.
 *
 * Usage:
 *   npm run repair:sec-urls
 *   npm run repair:sec-urls -- --no-delete    # validate + patch only, keep useless rows
 */
import pLimit from "p-limit";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { fetchRefIdBucket } from "./lib/nrs";
import { extractPdfText, wordCount } from "./lib/pdf";
import { storeRegulationEmbedding, regulationEmbeddingText } from "@/lib/embeddings";

const PDF_CONCURRENCY = Number(process.env.INGEST_PDF_CONCURRENCY ?? 4);
const MIN_FILE_BYTES = 1024; // smaller than this = placeholder, treat as missing
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** HEAD a URL with proper browser-like headers. Returns true if reachable AND substantive. */
async function urlIsLive(url: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": UA,
        Referer: "https://capital.sec.or.th/",
        Accept: "*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) return false;
    const len = Number(res.headers.get("content-length") ?? 0);
    // Placeholders are usually <1KB. Real PDFs are tens of KB minimum.
    if (Number.isFinite(len) && len > 0 && len < MIN_FILE_BYTES) return false;
    return true;
  } catch {
    return false;
  }
}

interface Existing extends Record<string, unknown> {
  id: number;
  doc_id: number;
  ref_id: number;
  body_th: string | null;
  body_en: string | null;
  title_th: string;
}

async function main() {
  const noDelete = process.argv.includes("--no-delete");

  const refIdsRow = await db.execute<{ ref_id: number; n: number } & Record<string, unknown>>(sql`
    SELECT ref_id, count(*)::int AS n
    FROM regulations
    WHERE source_type = 'sec_nrs' AND ref_id IS NOT NULL
    GROUP BY ref_id ORDER BY ref_id
  `);
  const refIds = refIdsRow.rows.map((r) => r.ref_id);
  console.log(
    `[repair] ${refIds.length} ref_ids covering ${refIdsRow.rows.reduce((s, r) => s + r.n, 0)} existing rows · noDelete=${noDelete}`
  );

  let urlsPatched = 0;
  let urlsValidated = 0;
  let urlsNulled = 0;
  let bodiesFilled = 0;
  let bodyFetchFailed = 0;
  const limit = pLimit(PDF_CONCURRENCY);

  for (const refId of refIds) {
    let scraped;
    try {
      scraped = await fetchRefIdBucket(refId);
    } catch (err) {
      console.warn(`[repair]   bucket ${refId} fetch failed: ${(err as Error).message}`);
      continue;
    }
    const byDocId = new Map(scraped.map((s) => [s.docId, s]));
    console.log(`[repair] bucket ${refId} → ${scraped.length} fresh rows`);

    const existing = await db.execute<Existing>(sql`
      SELECT id, doc_id, ref_id, body_th, body_en, title_th
      FROM regulations
      WHERE source_type = 'sec_nrs' AND ref_id = ${refId}
    `);

    const tasks = existing.rows.map((row) =>
      limit(async () => {
        // Step 1: derive the candidate URLs (either from fresh scrape or existing)
        const fresh = byDocId.get(row.doc_id);
        const candidates = fresh
          ? { pdf: fresh.pdfUrl, text: fresh.pdfTextUrl, doc: fresh.docUrl, source: fresh.sourceUrl }
          : null;

        // Step 2: HEAD-validate each URL. Null out dead ones.
        const validated = candidates
          ? {
              pdf: (await urlIsLive(candidates.pdf)) ? candidates.pdf : null,
              text: (await urlIsLive(candidates.text)) ? candidates.text : null,
              doc: (await urlIsLive(candidates.doc)) ? candidates.doc : null,
              source: candidates.source, // keep — source is the search page, always live
            }
          : null;
        urlsValidated += 1;
        if (validated) {
          urlsNulled +=
            (validated.pdf === null ? 1 : 0) +
            (validated.text === null ? 1 : 0) +
            (validated.doc === null ? 1 : 0);
          await db.execute(sql`
            UPDATE regulations
            SET pdf_url = ${validated.pdf},
                pdf_text_url = ${validated.text},
                doc_url = ${validated.doc},
                source_url = ${validated.source}
            WHERE id = ${row.id}
          `);
          urlsPatched += 1;
        }

        // Step 3: if body is empty AND we have a working text-layer PDF, try to fill it
        if (
          (!row.body_th || row.body_th.trim().length < 50) &&
          validated?.text
        ) {
          const body = await extractPdfText(validated.text);
          if (body && body.length >= 50) {
            const wc = wordCount(body);
            await db.execute(sql`
              UPDATE regulations SET body_th = ${body}, word_count = ${wc} WHERE id = ${row.id}
            `);
            await storeRegulationEmbedding(row.id, regulationEmbeddingText({
              titleTh: row.title_th, titleEn: null, bodyTh: body, bodyEn: row.body_en,
            }));
            bodiesFilled += 1;
          } else {
            bodyFetchFailed += 1;
          }
        }
      })
    );
    await Promise.all(tasks);
  }

  console.log(
    `\n[repair] URLs validated: ${urlsValidated}, patched: ${urlsPatched}, dead URLs nulled out: ${urlsNulled}`
  );
  console.log(
    `[repair] Bodies — filled: ${bodiesFilled}, fetch failed: ${bodyFetchFailed} (likely scanned-only PDFs)`
  );

  // Step 4: optionally delete rows that have no content AND no working URLs
  if (!noDelete) {
    const deleted = await db.execute<{ id: number }>(sql`
      DELETE FROM regulations
      WHERE source_type = 'sec_nrs'
        AND (body_th IS NULL OR length(body_th) < 50)
        AND pdf_url IS NULL
        AND pdf_text_url IS NULL
        AND doc_url IS NULL
      RETURNING id
    `);
    console.log(`[repair] Deleted ${deleted.rows.length} useless rows (no body + no working URLs)`);
  }

  const remaining = await db.execute<{ n: number } & Record<string, unknown>>(sql`
    SELECT count(*)::int AS n FROM regulations WHERE source_type = 'sec_nrs'
  `);
  console.log(`[repair] DONE. ${remaining.rows[0]?.n} sec_nrs rows remain.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[repair] fatal:", err);
    process.exit(1);
  });
