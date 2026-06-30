/**
 * One-off: delete the SEC NRS rows that got ingested with mojibake titles
 * (before the windows-874 encoding fix in scripts/lib/nrs.ts). Identifies them
 * by the presence of the U+FFFD REPLACEMENT CHARACTER in title_th.
 *
 * Re-run `npm run ingest:bulk` after this to repopulate cleanly.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

async function main() {
  const before = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM regulations
    WHERE source_type = 'sec_nrs' AND title_th LIKE '%' || chr(65533) || '%'
  `);
  const corrupted = before.rows[0]?.n ?? 0;
  console.log(`[cleanup] ${corrupted} corrupted sec_nrs rows found`);

  if (corrupted === 0) {
    console.log("[cleanup] nothing to delete.");
    return;
  }

  // First null out any faqs that point at them (defensive — there shouldn't
  // be any FAQs against these garbage rows, but ON DELETE SET NULL handles it)
  const del = await db.execute<{ id: number }>(sql`
    DELETE FROM regulations
    WHERE source_type = 'sec_nrs' AND title_th LIKE '%' || chr(65533) || '%'
    RETURNING id
  `);
  console.log(`[cleanup] deleted ${del.rows.length} rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[cleanup] failed:", err);
    process.exit(1);
  });
