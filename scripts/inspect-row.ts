/**
 * Quick inspector — dumps a single regulation's body so we can see exactly
 * what garbage survived the loader. Usage: npm run inspect:row -- <slug>
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("usage: npm run inspect:row -- <playbook-slug>");
    process.exit(1);
  }

  const rows = await db.execute<{
    id: number;
    titleTh: string;
    bodyTh: string | null;
    bodyEn: string | null;
    wordCount: number;
  }>(sql`
    SELECT id, title_th AS "titleTh", body_th AS "bodyTh", body_en AS "bodyEn", word_count AS "wordCount"
    FROM regulations WHERE playbook_slug = ${slug}
  `);
  const r = rows.rows[0];
  if (!r) {
    console.error(`no row with slug=${slug}`);
    process.exit(1);
  }

  console.log(`id=${r.id}  title=${r.titleTh}  words=${r.wordCount}`);
  console.log(`\n===== body_th =====`);
  console.log(r.bodyTh ?? "(null)");
  console.log(`\n===== body_en =====`);
  console.log(r.bodyEn ?? "(null)");
}

main().then(() => process.exit(0));
