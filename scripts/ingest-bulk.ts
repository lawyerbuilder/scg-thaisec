/**
 * SEC NRS bulk ingestion — designed for long, unattended overnight runs.
 *
 * Differences from `scripts/ingest.ts` (the small/test runner):
 *   - Walks BULK_REF_IDS by default (1..100) instead of just a handful.
 *   - No deadline by default (set INGEST_MAX_MINUTES if you want one).
 *   - Larger PDF concurrency (4 vs 2).
 *   - Skips a bucket entirely after the first attempt returns 0 rows, so
 *     dead ref_ids don't drain the budget.
 *   - Periodic per-bucket + global progress logging with ETA estimate.
 *   - Resumes cleanly across re-runs because dedup is on the
 *     `regulations.doc_id` partial unique index — already-ingested docs
 *     short-circuit at the SELECT check in ingestOne().
 *
 * Auto-embedding: each successfully inserted row gets a vector embedding
 * (best-effort, swallows errors). Backfill any misses later with
 * `npm run backfill:embeddings`.
 *
 * Usage:
 *   npm run ingest:bulk
 *   INGEST_MAX_DOCS=2000 npm run ingest:bulk
 *   INGEST_REF_IDS=1,2,3,80 npm run ingest:bulk
 *
 * Stop anytime with Ctrl+C — in-flight inserts finish, then it exits.
 */

import pLimit from "p-limit";
import { fetchRefIdBucket, type ScrapedRow } from "./lib/nrs";
import { ingestOne, type IngestOutcome } from "./lib/ingest-one";
import { BULK_REF_IDS, DEFAULT_REF_IDS } from "./lib/queries";

function parseRefIds(): number[] {
  const env = process.env.INGEST_REF_IDS;
  if (env) {
    return env
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  // Default: combine the hand-picked 'known good' list with the wider 1..100 sweep,
  // dedupped, in the order: known good first (so first-pass produces results sooner)
  const seen = new Set<number>();
  return [...DEFAULT_REF_IDS, ...BULK_REF_IDS].filter((n) => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

const MAX_DOCS = Number(process.env.INGEST_MAX_DOCS ?? 50_000);
const MAX_MINUTES = process.env.INGEST_MAX_MINUTES
  ? Number(process.env.INGEST_MAX_MINUTES)
  : Infinity;
const PDF_CONCURRENCY = Number(process.env.INGEST_PDF_CONCURRENCY ?? 4);
const PROGRESS_EVERY = Number(process.env.INGEST_PROGRESS_EVERY ?? 25);

interface Stats {
  new: number;
  duplicate: number;
  skipped: number;
  error: number;
}

function pad(n: number, w = 5): string {
  return String(n).padStart(w);
}
function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h${m}m` : m > 0 ? `${m}m${sec}s` : `${sec}s`;
}

async function main() {
  const refIds = parseRefIds();
  const start = Date.now();
  const deadline = Number.isFinite(MAX_MINUTES) ? start + MAX_MINUTES * 60_000 : Infinity;
  const stats: Stats = { new: 0, duplicate: 0, skipped: 0, error: 0 };
  let processed = 0;
  let aborted = false;
  const limit = pLimit(PDF_CONCURRENCY);
  const deadBuckets = new Set<number>();

  console.log(
    `[ingest-bulk] starting · ${refIds.length} ref_ids · maxDocs=${MAX_DOCS} · ` +
      `maxMinutes=${Number.isFinite(MAX_MINUTES) ? MAX_MINUTES : "∞"} · ` +
      `pdfConcurrency=${PDF_CONCURRENCY}`
  );

  process.on("SIGINT", () => {
    console.log("\n[ingest-bulk] SIGINT — finishing in-flight work and exiting…");
    aborted = true;
  });

  function shouldStop(): boolean {
    return aborted || Date.now() > deadline || processed >= MAX_DOCS;
  }

  function logProgress(reason: string) {
    const elapsed = Date.now() - start;
    const rate = processed / Math.max(elapsed / 1000, 1);
    const remaining = Math.max(0, MAX_DOCS - processed);
    const etaSec = rate > 0 ? Math.round(remaining / rate) : null;
    console.log(
      `[ingest-bulk] ${reason} · processed=${pad(processed)} new=${pad(stats.new)} ` +
        `dup=${pad(stats.duplicate)} skip=${pad(stats.skipped)} err=${pad(stats.error)} · ` +
        `${rate.toFixed(1)}/s · elapsed=${formatDuration(elapsed)}` +
        (etaSec !== null && remaining > 0 && rate > 0.05
          ? ` · ETA ${formatDuration(etaSec * 1000)}`
          : "")
    );
  }

  outer: for (const refId of refIds) {
    if (shouldStop()) break;
    if (deadBuckets.has(refId)) continue;

    let rows: ScrapedRow[] = [];
    try {
      rows = await fetchRefIdBucket(refId);
    } catch (err) {
      console.warn(
        `[ingest-bulk]   bucket ${refId} fetch failed: ${(err as Error).message}`
      );
      continue;
    }

    if (rows.length === 0) {
      deadBuckets.add(refId);
      continue;
    }

    console.log(`[ingest-bulk] bucket ${refId} → ${rows.length} rows`);

    const tasks = rows.map((row) =>
      limit(async () => {
        if (shouldStop()) return;
        processed += 1;
        try {
          const result = await ingestOne(row);
          stats[result.outcome] += 1;
        } catch (err) {
          stats.error += 1;
          console.warn(
            `[ingest-bulk]   doc ${row.docId} ingestOne threw: ${(err as Error).message}`
          );
        }
        if (processed % PROGRESS_EVERY === 0) {
          logProgress(`tick`);
        }
      })
    );
    await Promise.all(tasks);
    logProgress(`bucket ${refId} done`);

    if (shouldStop()) break outer;
  }

  const elapsed = Date.now() - start;
  console.log(
    `\n[ingest-bulk] DONE · ${formatDuration(elapsed)} · processed=${processed} ` +
      `new=${stats.new} dup=${stats.duplicate} skipped=${stats.skipped} err=${stats.error} · ` +
      `dead buckets=${deadBuckets.size}/${refIds.length}`
  );
  if (stats.new > 0) {
    console.log(
      `[ingest-bulk] Reminder: run \`npm run backfill:embeddings\` if any new rows missed their ` +
        `embedding (this happens when AI_GATEWAY_API_KEY isn't available during ingest).`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ingest-bulk] fatal:", err);
    process.exit(1);
  });
