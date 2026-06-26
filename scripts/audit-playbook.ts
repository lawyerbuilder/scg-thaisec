/**
 * Audits every internal_playbook regulation in the DB and reports content
 * quality issues. Run this after `npm run load:playbook` to spot rows that
 * still have garbage or are missing content entirely.
 *
 * Checks per row:
 *   - empty body (no content loaded)
 *   - URL-encoded character runs (suggests raw Notion link survived cleanup)
 *   - markdown link syntax leaked through (`[...](...)`)
 *   - very short body (likely a container that should have been merged)
 *
 * Usage:
 *   npm run audit:playbook
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

interface Row extends Record<string, unknown> {
  id: number;
  playbookSlug: string;
  titleTh: string;
  bodyTh: string | null;
  bodyEn: string | null;
  wordCount: number;
}

interface Issue {
  kind: "empty" | "tiny" | "url_encoded" | "raw_link" | "url_garbage_chars";
  hint: string;
}

function auditOne(row: Row): Issue[] {
  const issues: Issue[] = [];
  const combined = (row.bodyTh ?? "") + "\n" + (row.bodyEn ?? "");

  if (!combined.trim()) {
    issues.push({ kind: "empty", hint: "body is empty (content might be in a sibling .docx)" });
    return issues;
  }
  if (combined.trim().length < 50) {
    issues.push({
      kind: "tiny",
      hint: `body is only ${combined.trim().length} chars — likely a container`,
    });
  }
  // URL-encoded triplets (Notion paths embed Thai chars as %XX%XX%XX)
  const enc = combined.match(/(%[0-9A-Fa-f]{2}){3,}/g);
  if (enc && enc.length > 0) {
    issues.push({
      kind: "url_encoded",
      hint: `${enc.length} run(s) of URL-encoded chars (Notion paths leaked)`,
    });
  }
  // Markdown link syntax `[X](Y)`
  const links = combined.match(/\[[^\]]+\]\([^)]+\)/g);
  if (links && links.length > 0) {
    issues.push({
      kind: "raw_link",
      hint: `${links.length} surviving markdown link(s)`,
    });
  }
  // Half-stripped link garbage — but only count URL-shaped scraps. Plain
  // parenthetical content like `(๑) item` or `(นายทศพล ทังสุบุตร)` is
  // legitimate Thai legal style and must NOT be flagged.
  const halfLinks = combined.match(
    /^[\s ]*[(\[][^\n)\]]*[)\]][\s ]*$/gm
  );
  const realScraps = (halfLinks ?? []).filter((line) => {
    return /%[0-9A-Fa-f]{2}|\.(md|docx|pdf)\)?$/i.test(line);
  });
  if (realScraps.length > 0) {
    issues.push({
      kind: "url_garbage_chars",
      hint: `${realScraps.length} URL-shaped scrap(s)`,
    });
  }
  return issues;
}

async function main() {
  const rows = await db.execute<Row>(sql`
    SELECT
      id,
      playbook_slug AS "playbookSlug",
      title_th AS "titleTh",
      body_th AS "bodyTh",
      body_en AS "bodyEn",
      word_count AS "wordCount"
    FROM regulations
    WHERE source_type = 'internal_playbook'
    ORDER BY playbook_slug NULLS LAST
  `);

  console.log(`[audit] ${rows.rows.length} playbook rows\n`);

  let cleanCount = 0;
  const byKind: Record<Issue["kind"], number> = {
    empty: 0,
    tiny: 0,
    url_encoded: 0,
    raw_link: 0,
    url_garbage_chars: 0,
  };
  const problemRows: { row: Row; issues: Issue[] }[] = [];

  for (const r of rows.rows) {
    const issues = auditOne(r);
    if (issues.length === 0) {
      cleanCount += 1;
      console.log(
        `  ✓ ${r.playbookSlug?.padEnd(10) ?? "(no slug)"} ${truncate(r.titleTh, 50)} (${r.wordCount}w)`
      );
    } else {
      for (const i of issues) byKind[i.kind] += 1;
      problemRows.push({ row: r, issues });
      console.log(
        `  ✗ ${r.playbookSlug?.padEnd(10) ?? "(no slug)"} ${truncate(r.titleTh, 50)} (${r.wordCount}w)`
      );
      for (const i of issues) {
        console.log(`        ${i.kind.padEnd(20)} ${i.hint}`);
      }
    }
  }

  console.log(`\n[audit] summary:`);
  console.log(`  clean:               ${cleanCount} / ${rows.rows.length}`);
  console.log(`  empty body:          ${byKind.empty}`);
  console.log(`  tiny body (<50ch):   ${byKind.tiny}`);
  console.log(`  url-encoded leaks:   ${byKind.url_encoded}`);
  console.log(`  raw markdown links:  ${byKind.raw_link}`);
  console.log(`  paren/bracket scraps:${byKind.url_garbage_chars}`);
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[audit] fatal:", err);
    process.exit(1);
  });
