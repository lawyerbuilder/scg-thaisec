/**
 * Quick test: fetch one NRS bucket and print the first 5 titles so we can
 * eyeball whether the encoding fix produces real Thai or still garbage.
 */
import { fetchRefIdBucket } from "./lib/nrs";

async function main() {
  const refId = Number(process.argv[2] ?? 80);
  const rows = await fetchRefIdBucket(refId);
  console.log(`[inspect-nrs] ref_id=${refId} → ${rows.length} rows. First 5 titles:`);
  for (const r of rows.slice(0, 5)) {
    console.log(`  - doc_id=${r.docId}  ${r.titleTh.slice(0, 100)}`);
  }
}

main().then(() => process.exit(0));
