# SCG ThaiSEC

A Thai capital-markets **compliance research + FAQ workspace** for SCG Legal.
Turns dense Thai SEC regulations and internal playbooks into verified, searchable
Q&A pairs that a lawyer signs off on.

> **Intended for the internal use of SCG personnel only.** Not legal advice.
> Not affiliated with the SEC Thailand.

## What it does

```
                  ┌─────────────────────────┐
SEC NRS crawler   │                         │       AI ask in TH/EN
─────────────────►│   regulations  +  faqs  │◄────  with citations
Notion playbook   │   (Postgres)            │
File upload       │                         │       MCP for Claude / ChatGPT
                  └────────────▲────────────┘
                               │
                       AI drafts Q&A
                       Lawyer verifies
                       (Stale after 1y)
```

Three intake channels feed a regulation library; the AI drafts FAQs grounded
in each source; a lawyer reviews and verifies; verified answers become a
bilingual searchable corpus available in the web UI, via Claude, or via
ChatGPT (Custom GPT).

## Stack

Next.js 15 App Router · TypeScript · Tailwind v3 · Drizzle ORM + Neon Postgres
· Postgres FTS (tsvector + GIN) + `pg_trgm` + `pgvector` for hybrid lexical +
semantic retrieval · Groq for chat (gpt-oss-20b, Llama-4 fallback) · Vercel AI
Gateway for embeddings (text-embedding-3-small) · Resend for notifications ·
mammoth + unpdf for document parsing · MCP server at `/api/mcp` · OpenAPI 3.1
at `/openapi.json` · Deployed on Vercel.

## Local setup (Path B: local dev + Vercel deploy)

Order matters. From a fresh checkout:

1. `npm install`
2. `npm run typecheck && npm run build`
3. `git init && git remote add origin git@github.com:<user>/scg-thaisec.git && git push -u origin main`
4. Import on Vercel → first deploy will succeed thanks to the placeholder
   `DATABASE_URL`, but DB-backed pages will 500 until step 6.
5. Vercel → Storage → add Neon. `DATABASE_URL` + `DATABASE_URL_UNPOOLED` +
   the `POSTGRES_*` aliases auto-wire to all three envs.
6. `vercel env pull .env.local`
7. `npm run db:migrate-raw` — applies every SQL file in `drizzle/`
   idempotently. Don't use `drizzle-kit push`; it can't model the generated
   `tsvector` columns or the `pg_trgm` GIN indexes or `pgvector`.
8. `npm run seed` — bootstraps the regulation-type taxonomy
9. `npm run dev` and visit http://localhost:3000

## Loading content

Each intake channel is its own command. Re-runs are safe (dedup at the row level).

| Command | What it does | Source |
|---|---|---|
| `npm run ingest:bulk` | Crawl Thai SEC notifications, paginate buckets 1-100, dedup, store body text from text-layer PDFs | `capital.sec.or.th/webapp/nrs/` (Windows-874 HTML) |
| `npm run load:playbook` | Walk a Notion-exported AGM compliance playbook, parse bilingual markdown tables, store as `source_type='internal_playbook'` | Notion export folder (path passed as arg) |
| `npm run load:faqs -- <folder>` | Load SCG Legal's hand-written Q&A `.docx` files as `status='verified'` FAQs | A folder containing `QA_Legal_*.docx` |
| `npm run generate:faqs` | For each loaded regulation, ask Groq to draft 3-5 grounded Q&A pairs (saved as draft) | Any regulation row |
| `npm run backfill:embeddings` | Generate vector embeddings for any row missing one (needed for semantic search) | All `regulations` + `faqs` |
| `npm run backfill:translations` | For any Thai-only row, translate to English via Groq | All `regulations` + `faqs` |
| `npm run audit:playbook` | Report content-quality issues across all `internal_playbook` rows | Internal diagnostic |

## Key environment variables

| Var | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Yes | Neon Postgres |
| `GROQ_API_KEY` | Yes | Chat: FAQ generation, asking, improving, translation |
| `AI_GATEWAY_API_KEY` *or* `VERCEL_OIDC_TOKEN` | Recommended | Embeddings via Vercel AI Gateway |
| `RESEND_API_KEY` | Optional | Email notifications when FAQs are assigned / verified |
| `EMAIL_FROM` | Optional | Verified-domain sender for Resend (defaults to sandbox) |
| `SITE_PASSWORD` | Optional | Basic-auth gate on the whole site (set on Vercel only) |
| `THAISEC_SITE_URL` | Optional | Canonical URL surfaced by MCP / OpenAPI |

## File layout

```
app/
  layout.tsx, globals.css            · shell + design tokens
  page.tsx                            · homepage hero + How-It-Works stepper
  search/                             · FTS results
  regulations/                        · list + detail (locale-aware bodies)
  faq/                                · list + detail + AI ask box + edit + verify
  upload/                             · FAQ generator (drag-drop multi-file)
  admin/lawyers/                      · roster CRUD (powers the assignment dropdown)
  types/, categories/                 · taxonomy
  favorites/                          · localStorage saved items
  connect/                            · step-by-step Claude / ChatGPT setup
  about/, terms/                      · static
  api/mcp/route.ts                    · MCP server — 11 tools (read + admin write)
  api/regulations/*                   · REST for the OpenAPI surface
  api/upload/route.ts                 · multipart upload, parse, persist, gen FAQs
  api/faq/ask, /promote, /[id]/improve · AI ask + improve endpoints
  api/lawyers/*                       · CRUD for the lawyer roster
  openapi.json/route.ts               · OpenAPI 3.1 spec
components/                           · UI primitives + bespoke
hooks/use-locale.ts                   · EN/TH toggle state (localStorage)
lib/
  db/schema.ts, db/index.ts           · Drizzle schema + client
  search.ts                           · Regulation FTS + Thai trigram
  faqs.ts                             · FAQ queries + mutations
  faq-ask.ts                          · Hybrid retrieval (vector + lexical) + Groq
  faq-generator.ts                    · Groq Q&A generation grounded in source
  faq-improve.ts                      · AI rewrite with optional lawyer instruction
  embeddings.ts                       · Vercel AI Gateway embeddings (best-effort)
  email.ts                            · Resend notifications (best-effort)
  parse-document.ts                   · PDF/DOCX/TXT text extraction
  parse-qa-docx.ts                    · SCG Q&A .docx → ParsedQA[]
  lawyers.ts                          · Lawyer roster queries
  utils.ts                            · cn(), formatDate(), containsThai(), faqStaleness()
middleware.ts                         · Site-wide basic auth (SITE_PASSWORD)
scripts/                              · CLI scripts (run with --env-file=.env.local)
  lib/                                · Shared ingest helpers (NRS scrape, PDF text)
  seed.ts                             · Taxonomy bootstrap
  ingest.ts, ingest-bulk.ts           · SEC NRS scraping + ingest
  load-playbook.ts                    · Notion → regulations
  load-faqs.ts                        · QA_Legal_*.docx → faqs
  generate-faqs.ts                    · AI FAQ generation for existing regs
  backfill-embeddings.ts              · Vector backfill
  backfill-translations.ts            · Th→En backfill
  audit-playbook.ts                   · Content-quality audit
  migrate-raw.ts                      · Raw SQL migration runner
drizzle/                              · Raw SQL migrations (idempotent)
  0000_init.sql                       · regulation_types, regulations, FTS, trigram
  0001_playbook_and_faqs.sql          · source_type, playbook_slug, faqs table
  0002_uploads.sql                    · uploaded_by, original_filename, 'uploaded' type
  0003_faq_assignment.sql             · faqs.assigned_to
  0004_lawyers.sql                    · lawyers roster
  0005_pgvector.sql                   · vector(1536) on regulations + faqs, HNSW idx
```

## Gotchas worth remembering

These cost real time. The CLAUDE.md in this repo has the full list; the
most-frequently-stepped-on ones:

1. **Thai SEC NRS HTML is Windows-874**, not UTF-8. `scripts/lib/nrs.ts`
   sniffs the encoding before decoding — don't regress to `res.text()`.
2. **Generated columns**: quote `"text"` in `GENERATED ALWAYS AS` expressions
   when the column is named `text`, else PG parses it as the type.
3. **Env files in npm scripts**: `dotenv/config` only reads `.env`, not
   `.env.local`. Use `tsx --env-file=.env.local script.ts`.
4. **AI SDK v6**: `ai@^6` for the `"provider/model"` Gateway string pattern.
5. **Groq model selection**: `openai/gpt-oss-20b` supports json_schema;
   `llama-3.3-70b-versatile` does NOT. Use Llama-4-scout as the json_schema
   fallback model.
6. **VERCEL_OIDC_TOKEN expires** (~12h). If embeddings fail locally, run
   `vercel env pull .env.local` for a fresh one.
7. **MCP route exports**: GET, POST, AND DELETE all needed for StreamableHTTP.

## Source attribution

- Thai SEC NRS notifications: pulled from <https://capital.sec.or.th/> (search)
  + <https://publish.sec.or.th/nrs/> (PDFs). We index and attribute — we
  do not republish.
- AGM Compliance Playbook: SCG Legal internal Notion export.
- Q&A: SCG Legal authored (Section 4 documents).

## License

See `LICENSE`. Code is open source; data on this site originates from the SEC
Thailand and SCG Legal and is governed by those publishers.
