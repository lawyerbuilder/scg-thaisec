/**
 * Applies every raw SQL file in drizzle/ against the connected database, in
 * filename order. All migrations are written to be idempotent (CREATE … IF
 * NOT EXISTS, DROP … IF EXISTS, ON CONFLICT DO NOTHING) so re-runs are safe.
 *
 * Uses DATABASE_URL_UNPOOLED so we get a direct (non-pgbouncer) connection
 * that allows multi-statement SQL execution.
 *
 * Usage:
 *   npm run db:migrate-raw                # apply all
 *   npm run db:migrate-raw -- 0002        # apply only files containing "0002"
 */

import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate-raw] DATABASE_URL_UNPOOLED / DATABASE_URL not set");
    process.exit(1);
  }

  const filter = process.argv[2];
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !filter || f.includes(filter))
    .sort();

  if (files.length === 0) {
    console.error(`[migrate-raw] no .sql files in ${MIGRATIONS_DIR} match`);
    process.exit(1);
  }

  console.log(`[migrate-raw] applying ${files.length} file(s)…`);
  const client = neon(url);

  for (const f of files) {
    const fullPath = path.join(MIGRATIONS_DIR, f);
    const sql = fs.readFileSync(fullPath, "utf-8");
    const statements = splitStatements(sql);
    console.log(`  ▸ ${f} (${statements.length} statement(s))`);

    for (const [i, stmt] of statements.entries()) {
      try {
        await client(stmt);
      } catch (err) {
        const e = err as Error & { code?: string };
        console.error(
          `    ✗ statement ${i + 1} failed [${e.code ?? "?"}]: ${e.message}\n` +
            `      ${stmt.slice(0, 200).replace(/\s+/g, " ")}…`
        );
        process.exit(1);
      }
    }
    console.log(`    ✓ done`);
  }

  console.log(`[migrate-raw] all good.`);
}

/**
 * Split a SQL file into individual statements on semicolons, respecting
 * single-quoted string literals and line/block comments. Good enough for our
 * migration files (no PL/pgSQL DO blocks or dollar-quoting).
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inSingle = false;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    // Line comment
    if (!inSingle && c === "-" && next === "-") {
      const eol = sql.indexOf("\n", i);
      i = eol === -1 ? sql.length : eol;
      continue;
    }
    // Block comment
    if (!inSingle && c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    // Quoted-string toggle (handle '' escape inside)
    if (c === "'") {
      if (inSingle && sql[i + 1] === "'") {
        buf += "''";
        i += 2;
        continue;
      }
      inSingle = !inSingle;
      buf += c;
      i++;
      continue;
    }
    if (c === ";" && !inSingle) {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = "";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate-raw] fatal:", err);
    process.exit(1);
  });
