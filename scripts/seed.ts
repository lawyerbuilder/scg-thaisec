import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { REGULATION_TYPES } from "./lib/queries";

async function main() {
  console.log(`[seed] upserting ${REGULATION_TYPES.length} regulation types…`);
  for (const t of REGULATION_TYPES) {
    await db.execute(sql`
      INSERT INTO regulation_types (slug, name_en, name_th, description_en, category)
      VALUES (${t.slug}, ${t.nameEn}, ${t.nameTh}, ${t.descriptionEn ?? null}, ${t.category})
      ON CONFLICT (slug) DO UPDATE SET
        name_en = EXCLUDED.name_en,
        name_th = EXCLUDED.name_th,
        description_en = EXCLUDED.description_en,
        category = EXCLUDED.category
    `);
  }
  console.log(`[seed] done.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
