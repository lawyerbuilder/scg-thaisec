import pLimit from "p-limit";
import { fetchRefIdBucket } from "./lib/nrs";
import { ingestOne, type IngestOutcome } from "./lib/ingest-one";
import { DEFAULT_REF_IDS } from "./lib/queries";

function parseRefIds(): number[] {
  const env = process.env.INGEST_REF_IDS;
  if (!env) return DEFAULT_REF_IDS;
  return env
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

const MAX_DOCS = Number(process.env.INGEST_MAX_DOCS ?? 500);
const MAX_MINUTES = Number(process.env.INGEST_MAX_MINUTES ?? 20);
const PDF_CONCURRENCY = Number(process.env.INGEST_PDF_CONCURRENCY ?? 2);

async function main() {
  const refIds = parseRefIds();
  console.log(
    `[ingest] starting · refIds=${refIds.join(",")} · maxDocs=${MAX_DOCS} · maxMinutes=${MAX_MINUTES}`
  );

  const start = Date.now();
  const deadline = start + MAX_MINUTES * 60_000;
  const stats: Record<IngestOutcome, number> = {
    new: 0,
    duplicate: 0,
    skipped: 0,
    error: 0,
  };
  let processed = 0;
  const limit = pLimit(PDF_CONCURRENCY);
  let aborted = false;

  process.on("SIGINT", () => {
    console.log("\n[ingest] SIGINT — finishing in-flight inserts and exiting…");
    aborted = true;
  });

  outer: for (const refId of refIds) {
    if (aborted || Date.now() > deadline || processed >= MAX_DOCS) break;
    console.log(`[ingest] fetching bucket ref_id=${refId}…`);
    let rows;
    try {
      rows = await fetchRefIdBucket(refId);
    } catch (err) {
      console.error(`[ingest] bucket ${refId} failed:`, (err as Error).message);
      continue;
    }
    console.log(`[ingest]   ${rows.length} rows`);

    const tasks = rows.map((row) =>
      limit(async () => {
        if (aborted || Date.now() > deadline || processed >= MAX_DOCS) return;
        processed += 1;
        const result = await ingestOne(row);
        stats[result.outcome] += 1;
        if (processed % 10 === 0) {
          console.log(
            `[ingest]   processed=${processed} new=${stats.new} dup=${stats.duplicate} err=${stats.error}`
          );
        }
      })
    );
    await Promise.all(tasks);
    if (aborted || Date.now() > deadline || processed >= MAX_DOCS) break outer;
  }

  const minutes = ((Date.now() - start) / 60_000).toFixed(1);
  console.log(
    `[ingest] done · ${minutes}m · processed=${processed} new=${stats.new} dup=${stats.duplicate} skipped=${stats.skipped} err=${stats.error}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ingest] fatal:", err);
    process.exit(1);
  });
