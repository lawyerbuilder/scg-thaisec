/**
 * Loads the SCG AGM Compliance Playbook into the `regulations` table as
 * source_type='internal_playbook' rows.
 *
 * The Notion export has a mixed hierarchy:
 *   - Some sections (e.g. 1.1, 2.1, 2.7) are LEAVES with the actual bilingual
 *     content in their top-level .md file.
 *   - Others (1.2, 1.3, 1.4, 2.4, 2.6) are CONTAINERS — their top .md just
 *     points to sub-pages (1.2.1, 1.2.2, ...) in a subdirectory of the same
 *     name. The real content lives in those sub-pages.
 *
 * This loader walks both layers, loading every leaf as its own row. Container
 * pages are still loaded but with their attachment/sub-page link noise stripped
 * (they end up with mostly-empty bodies that serve as navigation parents).
 *
 * Section 4 (the Q&A) is deferred to `load-faqs.ts` — those rows go to the
 * `faqs` table, not `regulations`.
 *
 * Usage:
 *   npm run load:playbook -- "<path-to-AGM-folder>"
 */

import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const DEFAULT_AGM_FOLDER =
  "C:/Users/abigails/AppData/Local/Temp/agm-export/Private & Shared";
const INDEX_FILENAME = "AGM ATS 1cf7473200d280cda53aead3b9b456e3.md";

interface PlaybookPage {
  slug: string;
  number: string;
  titleTh: string;
  titleEn: string | null;
  notionHash: string;
  filePath: string;
  parentSlug: string | null;
}

function main() {
  const rootArg = process.argv[2] ?? DEFAULT_AGM_FOLDER;
  const indexPath = path.join(rootArg, INDEX_FILENAME);

  if (!fs.existsSync(indexPath)) {
    console.error(`[load-playbook] index not found: ${indexPath}`);
    console.error(`Pass the folder containing the AGM index as the first arg.`);
    process.exit(1);
  }

  const topSections = parseIndex(indexPath);
  console.log(`[load-playbook] index has ${topSections.length} top-level sections`);

  const playbookDir = path.join(rootArg, "AGM ATS");
  const allPages = expandSections(topSections, playbookDir);
  console.log(`[load-playbook] expanded to ${allPages.length} pages (incl. children)`);

  return loadAll(allPages);
}

interface IndexEntry {
  number: string;
  titleTh: string;
  titleEn: string | null;
  notionHash: string;
}

function parseIndex(indexPath: string): IndexEntry[] {
  const content = fs.readFileSync(indexPath, "utf-8");
  const out: IndexEntry[] = [];

  let currentTopLevel: string | null = null;
  let section3Counter = 0;

  for (const line of content.split(/\r?\n/)) {
    const topLevelMatch = line.match(/^- \*\*(\d+)\. /);
    if (topLevelMatch) {
      currentTopLevel = topLevelMatch[1];
      continue;
    }

    const linkMatch = line.match(/^\s*\[([^\]]+)\]\(([^)]+)\)\s*$/);
    if (!linkMatch) continue;

    const rawTitle = linkMatch[1];
    const relativePath = decodeURIComponent(linkMatch[2]);
    if (!relativePath.endsWith(".md")) continue;
    if (currentTopLevel === "4") continue; // Q&A → faqs table

    let number: string;
    const numberedMatch = rawTitle.match(/^(\d+(?:\.\d+)?)/);
    if (numberedMatch) {
      number = numberedMatch[1];
    } else if (currentTopLevel === "3") {
      section3Counter += 1;
      number = `3.${section3Counter}`;
    } else {
      console.warn(`[load-playbook] skipping unrecognized link: ${rawTitle}`);
      continue;
    }

    const titleNoNum = rawTitle.replace(/^\d+(?:\.\d+)?\s*/, "");
    const { titleTh, titleEn } = splitBilingualTitle(titleNoNum);

    const hashMatch = path.basename(relativePath).match(/([0-9a-f]{32})\.md$/);
    if (!hashMatch) continue;

    out.push({ number, titleTh, titleEn, notionHash: hashMatch[1] });
  }
  return out;
}

/**
 * For each top-level section, also walk into the AGM ATS tree to discover
 * nested sub-pages. Notion directory names don't include the hash (only .md
 * files do), so we just recursively index every .md by hash and look up
 * by that — sidesteps Thai-filename matching entirely.
 */
function expandSections(
  topSections: IndexEntry[],
  playbookDir: string
): PlaybookPage[] {
  const mdByHash = indexMdRecursively(playbookDir);
  const pages: PlaybookPage[] = [];

  for (const sec of topSections) {
    const topFilePath = mdByHash.get(sec.notionHash);
    if (!topFilePath) {
      console.warn(`[load-playbook] missing top file for ${sec.number}`);
      continue;
    }
    const topSlug = `pb-${sec.number}`;
    pages.push({
      slug: topSlug,
      number: sec.number,
      titleTh: sec.titleTh,
      titleEn: sec.titleEn,
      notionHash: sec.notionHash,
      filePath: topFilePath,
      parentSlug: null,
    });

    // Extract child .md references from the parent's body
    const parentBody = fs.readFileSync(topFilePath, "utf-8");
    const childRefs = extractMdLinks(parentBody);

    let unnumberedChildIdx = 0;
    const usedChildNumbers = new Set<string>();
    for (const ref of childRefs) {
      const childPath = mdByHash.get(ref.hash);
      if (!childPath) continue;
      if (childPath === topFilePath) continue;

      // Strip bold markers first — Notion titles like "**1.2.2 ..." would
      // otherwise miss the leading-number regex and fall back to a counter
      // that collides with siblings that DID parse correctly.
      const cleanRefTitle = ref.title.replace(/\*\*/g, "").trim();
      const numMatch = cleanRefTitle.match(/^(\d+(?:\.\d+)*)/);
      let childNumber: string;
      if (numMatch) {
        childNumber = numMatch[1];
      } else {
        // Find the next unused slot under this parent
        do {
          unnumberedChildIdx += 1;
          childNumber = `${sec.number}.${unnumberedChildIdx}`;
        } while (usedChildNumbers.has(childNumber));
      }
      usedChildNumbers.add(childNumber);

      const titleNoNum = cleanRefTitle.replace(/^\d+(?:\.\d+)*\s*/, "");
      const { titleTh, titleEn } = splitBilingualTitle(titleNoNum);

      pages.push({
        slug: `pb-${childNumber}`,
        number: childNumber,
        titleTh,
        titleEn,
        notionHash: ref.hash,
        filePath: childPath,
        parentSlug: topSlug,
      });
    }
  }
  return pages;
}

/** Walk the AGM ATS tree and map every .md hash → absolute file path. */
function indexMdRecursively(rootDir: string): Map<string, string> {
  const out = new Map<string, string>();
  walk(rootDir);
  return out;

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      const m = entry.name.match(/([0-9a-f]{32})\.md$/);
      if (m) out.set(m[1], p);
    }
  }
}

interface MdLink {
  title: string;
  hash: string;
}

function extractMdLinks(content: string): MdLink[] {
  const links: MdLink[] = [];
  // Multi-line aware — Notion links can wrap across lines within the (...).
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (const m of content.matchAll(pattern)) {
    const target = decodeURIComponent(m[2]);
    if (!target.endsWith(".md")) continue;
    const hashMatch = path.basename(target).match(/([0-9a-f]{32})\.md$/);
    if (!hashMatch) continue;
    links.push({ title: m[1], hash: hashMatch[1] });
  }
  return links;
}

/**
 * Notion titles look like:
 *   "รวบรวมข้อกฎหมาย.../**Legal Requirements Before...**"
 * Either side may or may not be wrapped in **. Some titles have no English half.
 */
function splitBilingualTitle(raw: string): { titleTh: string; titleEn: string | null } {
  const cleaned = raw.replace(/\*\*/g, "").trim();
  const slashIdx = cleaned.indexOf("/");
  if (slashIdx < 0) return { titleTh: cleaned, titleEn: null };
  return {
    titleTh: cleaned.slice(0, slashIdx).trim(),
    titleEn: cleaned.slice(slashIdx + 1).trim() || null,
  };
}

/**
 * Removes Notion's attachment/sub-page link noise from the body so only the
 * real prose + tables remain.
 *
 * Notion-exported markdown puts attachment refs and child-page refs as
 * markdown links — usually one per line, but the URL can wrap across many
 * lines (URL-encoded Thai paths are long). The naive line-anchored filter
 * I had before missed every multi-line wrap, leaving raw `[title]\n(url)`
 * garbage in the body.
 *
 * Fix: globally strip every `[...](...)` link (multi-line aware) from the
 * raw body BEFORE line-based cleanup. For the AGM playbook this is safe —
 * all legitimate content lives in markdown tables (no links inside) or
 * paragraph prose; the links we strip are all navigation noise.
 */
function cleanBody(raw: string): string {
  // Drop the leading H1 heading
  const lines = raw.split(/\r?\n/);
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) {
      startIdx = i + 1;
      break;
    }
  }
  let body = lines.slice(startIdx).join("\n");

  // Globally strip every markdown link, including multi-line wraps.
  // [^\]]+ and [^)]+ both match newlines (negated charclass excludes only
  // the close-bracket char), so this catches `[title\n](url\n with\n wraps)`.
  body = stripMarkdownLinks(body);

  // Mop up leftover orphan URL fragments — lines that are pure URL-encoded
  // junk or end with `.md)` / `.docx)` / `.pdf)`. Happens when the walker
  // couldn't reach the closing paren (e.g. unbalanced parens in source).
  body = body
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/%[0-9A-Fa-f]{2}.*\.(md|docx|pdf)\)?$/i.test(t)) return false;
      if (/^[)\]]\S*\.(md|docx|pdf)\)?$/i.test(t)) return false;
      return true;
    })
    .join("\n");

  // Collapse extra blank lines and trim
  return body
    .split(/\r?\n/)
    .map((l) => l.replace(/[\s ]+$/, "")) // trim trailing whitespace
    .filter((l, i, arr) => !(l.trim() === "" && arr[i - 1]?.trim() === ""))
    .join("\n")
    .trim();
}

/**
 * Strip markdown links and images using a balanced-paren walker. Necessary
 * because Notion URLs can contain literal `(...)` (e.g. `(e-proxy)` in the
 * filename) — a `[^)]+` regex would stop at the first `)` and leave the rest
 * of the URL as visible garbage.
 */
function stripMarkdownLinks(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    // Image — drop the `!` prefix; the `[` branch below handles the rest
    if (text[i] === "!" && text[i + 1] === "[") {
      i += 1;
      continue;
    }
    if (text[i] === "[") {
      // Find matching `]` (allow escaped `\]`)
      let j = i + 1;
      while (j < text.length && text[j] !== "]") {
        if (text[j] === "\\") j += 2;
        else j += 1;
      }
      if (j < text.length && text[j] === "]" && text[j + 1] === "(") {
        // Balanced-paren walk on the URL portion
        let depth = 1;
        let k = j + 2;
        while (k < text.length && depth > 0) {
          const c = text[k];
          if (c === "\\") {
            k += 2;
            continue;
          }
          if (c === "(") depth += 1;
          else if (c === ")") depth -= 1;
          k += 1;
        }
        if (depth === 0) {
          i = k;
          continue;
        }
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

/**
 * Sub-page bodies have two stacked Thai/English tables. Splits at the first
 * English table header (`| **Topic** |` etc). Falls back to Thai-only.
 */
function splitBilingualBody(raw: string): { bodyTh: string; bodyEn: string | null } {
  const enHeaderPattern =
    /\n\|\s*\*\*(Topic|Subject|Item|Issue|Matter|Question|Description|Reference|No\.|Name)\b/i;
  const match = raw.match(enHeaderPattern);
  if (!match || match.index === undefined) {
    return { bodyTh: raw, bodyEn: null };
  }
  const splitAt = match.index;
  const bodyTh = raw.slice(0, splitAt).trim();
  const bodyEn = raw.slice(splitAt).trim();
  return { bodyTh: bodyTh || raw, bodyEn: bodyEn || null };
}

async function loadAll(pages: PlaybookPage[]) {
  const typeRow = await db.execute<{ id: number }>(
    sql`SELECT id FROM regulation_types WHERE slug = 'agm-playbook' LIMIT 1`
  );
  const typeId = typeRow.rows[0]?.id ?? null;
  if (!typeId) {
    console.warn(
      `[load-playbook] regulation_type 'agm-playbook' not found — did you run migration 0001?`
    );
  }

  let inserted = 0;
  let updated = 0;

  for (const pg of pages) {
    const raw = fs.readFileSync(pg.filePath, "utf-8");
    const cleaned = cleanBody(raw);
    let { bodyTh, bodyEn } = splitBilingualBody(cleaned);

    // Fallback: if the .md is empty/sparse, try parsing the sibling .docx.
    // Many playbook leaf pages (2.5, 2.8-2.11, etc.) store their real content
    // in a .docx attachment that sits next to the .md.
    if ((bodyTh + (bodyEn ?? "")).trim().length < 50) {
      const docxText = await tryReadSiblingDocx(pg.filePath);
      if (docxText) {
        const split = splitBilingualBody(docxText);
        bodyTh = split.bodyTh;
        bodyEn = split.bodyEn;
      }
    }

    const wordCount = countWords(bodyTh) + countWords(bodyEn ?? "");

    const result = await db.execute<{ id: number; was_insert: boolean }>(sql`
      INSERT INTO regulations (
        source_type, playbook_slug, regulation_type_id,
        title_th, title_en, subject, document_type,
        body_th, body_en, word_count
      ) VALUES (
        'internal_playbook',
        ${pg.slug},
        ${typeId},
        ${pg.titleTh},
        ${pg.titleEn},
        ${"AGM Compliance"},
        ${"Internal Playbook"},
        ${bodyTh},
        ${bodyEn},
        ${wordCount}
      )
      ON CONFLICT (playbook_slug) WHERE playbook_slug IS NOT NULL DO UPDATE SET
        title_th = EXCLUDED.title_th,
        title_en = EXCLUDED.title_en,
        body_th = EXCLUDED.body_th,
        body_en = EXCLUDED.body_en,
        word_count = EXCLUDED.word_count,
        regulation_type_id = EXCLUDED.regulation_type_id
      RETURNING id, (xmax = 0) AS was_insert
    `);

    const row = result.rows[0];
    if (row?.was_insert) inserted += 1;
    else updated += 1;
    const indent = pg.parentSlug ? "    " : "  ";
    console.log(
      `${indent}${row?.was_insert ? "ins" : "upd"} ${pg.slug.padEnd(10)} ` +
        `${pg.titleTh.slice(0, 60)} (${wordCount}w)`
    );
  }

  console.log(`[load-playbook] done — ${inserted} inserted, ${updated} updated`);
}

function countWords(s: string): number {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Look for a sibling .docx in the same directory as the given .md and extract
 * its text via mammoth. The .docx name is the .md name minus ` <hash>.md`,
 * with .docx appended (Notion's convention).
 */
async function tryReadSiblingDocx(mdPath: string): Promise<string | null> {
  const dir = path.dirname(mdPath);
  const mdName = path.basename(mdPath);
  // Strip ` <hash>.md` to get the base name; the .docx is that base + .docx
  const baseMatch = mdName.match(/^(.+?)\s+[0-9a-f]{32}\.md$/);
  if (!baseMatch) return null;
  const baseName = baseMatch[1];

  // Try exact-prefix match in the directory (filenames may have small variations)
  let docxFile: string | null = null;
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.toLowerCase().endsWith(".docx")) continue;
      // Strip .docx and compare prefixes — tolerant of trailing whitespace
      const entryBase = entry.replace(/\.docx$/i, "").trim();
      if (entryBase === baseName.trim() || entryBase.startsWith(baseName.slice(0, 20))) {
        docxFile = entry;
        break;
      }
    }
  } catch {
    return null;
  }
  if (!docxFile) return null;

  try {
    const buf = fs.readFileSync(path.join(dir, docxFile));
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value.trim() || null;
  } catch (err) {
    console.warn(`[load-playbook] mammoth failed on ${docxFile}: ${(err as Error).message}`);
    return null;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[load-playbook] failed:", err);
    process.exit(1);
  });
