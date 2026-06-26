# SCG ThaiSEC — Claude house rules

You're working on SCG ThaiSEC, a sister project to SCG OpenClauses
(https://scg-openclauses.vercel.app — source at github.com/lawyerbuilder/openclauses).
This indexes Thai SEC content. Target audience: lawyers and compliance professionals at
SCG Legal.

> **On first session:** if you haven't yet, read `prompt.md` in this directory — it's the
> kickoff brief with product candidates the user wants you to research before scaffolding.
> Don't write code until the user picks a product shape.

## Stack (locked — do not re-litigate)

- Next.js 15 App Router · TypeScript · Tailwind v3
- shadcn-style primitives inlined (no shadcn CLI) · lucide-react icons
- Drizzle ORM + Neon Postgres (via Vercel Marketplace)
- Postgres full-text search with `tsvector` + GIN index
- MCP server at `/api/mcp` using `mcp-handler` + `@modelcontextprotocol/sdk`
- OpenAPI 3.1 spec at `/openapi.json` for ChatGPT Custom GPTs
- Deploy on Vercel + Neon (Hobby/free tiers fine)
- Vercel team: `badites-projects` · GitHub: `lawyerbuilder`
- Working directory: `D:\dev\scg-thaisec\` — **never** under OneDrive

## Brand (locked — apply `premium-ui` skill from day one)

- Primary: SCG red — HSL `354 77% 42%`
- Background: warm off-white — HSL `24 36% 99%`
- Cards: pure white with hairline borders
- 3px red ribbon at the very top of every page (`.brand-strip`)
- Wordmark format: `SCG <muted>ThaiSEC</muted>` next to a red rounded-square icon
- Eyebrow labels (uppercase, tracked) for section headers
- `.surface` and `.surface-hover` utility classes for all cards
- Tabular numerals (`tabular-nums`) on counts, dates, IDs
- Footer must include: "Intended for internal use of SCG personnel only" + "Not legal
  advice" + "No warranty; no liability" + link to `/terms`

## Workflow (Path B: local dev + Vercel deploy)

The order matters. When scaffolding fresh:

1. Scaffold locally → `npm install` → `npm run typecheck` → `npm run build`
2. `git init` → push to GitHub repo `lawyerbuilder/scg-thaisec`
3. Import on Vercel → first deploy will fail (no DB yet) — that's expected
4. Vercel → Storage → add Neon. `DATABASE_URL` auto-wires to all three envs.
5. In Neon's SQL Editor, run raw SQL from `drizzle/0000_init.sql` directly. Do **not**
   use `drizzle-kit push` for the initial migration — it can't model `tsvector`
   generated columns.
6. `vercel link` → it will offer to pull dev env vars into `.env.local`; say yes
7. Optional: `npm run seed` if there's seed data
8. `npm run dev`
9. Re-trigger Vercel deploy — second build succeeds

## File structure conventions

```
app/
  layout.tsx, globals.css         · shell + design tokens
  page.tsx                         · homepage
  [feature]/page.tsx               · feature pages
  api/[name]/route.ts              · REST endpoints
  api/mcp/route.ts                 · MCP server (mcp-handler)
  openapi.json/route.ts            · OpenAPI spec
components/                        · shadcn-style + bespoke
hooks/                             · client-side React hooks (localStorage, etc.)
lib/
  db/schema.ts, db/index.ts        · Drizzle schema + client
  search.ts                        · DB query helpers
  utils.ts                         · cn(), formatDate(), truncate()
scripts/                           · CLI scripts, NOT bundled into Next.js
  lib/                             · ingestion helpers
  ingest-*.ts, backfill-*.ts       · one-shot CLI scripts
drizzle/                           · raw SQL migrations
```

## Gotchas (don't repeat OpenClauses' pain)

These cost real time on OpenClauses. Don't make them again.

1. **Generated columns** — if `text` or `heading` is a column name, **quote it** as
   `"text"` in `GENERATED ALWAYS AS` expressions. Bare `text` is parsed as the
   Postgres type.

2. **Env files in npm scripts** — `dotenv/config` only reads `.env`, not `.env.local`.
   For scripts that need env vars, use:
   `"foo": "tsx --env-file=.env.local scripts/foo.ts"` in package.json.

3. **AI SDK version** — install `ai@^6` for the `"provider/model"` gateway string
   pattern. v4 errors with `LanguageModelV1` type mismatches.

4. **Groq model selection** — `llama-3.3-70b-versatile` does **not** support
   `response_format=json_schema`. Use `openai/gpt-oss-20b` or
   `meta-llama/llama-4-scout-17b-16e-instruct` for structured outputs.

5. **Groq rate limits** — free tier is 8k TPM. Strategy: keyword-first
   classification during ingestion, LLM only as fallback for unmatched. For
   bulk reclassification, sequential calls with 5s delay between them.

6. **Gateway auto-detection trap** — `VERCEL_OIDC_TOKEN` in `.env.local` is **not**
   a signal that the AI Gateway is usable. Only trust `AI_GATEWAY_API_KEY` or
   `VERCEL === "1"` (runtime).

7. **`useSearchParams` in client components** — must be wrapped in `<Suspense>`,
   or the parent page needs `export const dynamic = "force-dynamic"`. Otherwise
   build fails on `/_not-found` prerender.

8. **MCP route exports** — export the `mcp-handler` handler as `GET`, `POST`, **and**
   `DELETE`. All three needed for StreamableHTTP transport.

9. **Migrations before code** — when you add columns the code depends on, apply the
   SQL migration to Neon **before** pushing the code that uses the new column.
   Or the ingest will 100% fail silently.

10. **Bulk-runner design** — round-robin across query strategies, paginate, time +
    count budgets, graceful Ctrl+C, resumability via unique-index dedup. No
    checkpoint table needed.

11. **Heading parser** — never treat lines ending in articles/prepositions/conjunctions
    ("a", "the", "of", "if", "for") as headings. They're mid-sentence splits from
    awkward HTML line breaks.

12. **One nav link mismatched to its page** — if you build a page that grows past its
    original scope (e.g., `/connect` started as Claude-only and added ChatGPT), update
    the nav link copy too. Audit before commit.

## Bilingual UI requirements (Thai-specific)

- Postgres `to_tsvector('english', ...)` tokenizes Thai poorly. Research
  before committing — likely use `pg_trgm` extension for trigram-based fuzzy
  match or external search like Typesense with Thai support.
- UI must support EN/TH toggle, persist choice in localStorage
- Thai content needs a fallback font stack including Noto Sans Thai
- Search must accept both Thai and English queries

## Common commands

```bash
npm run dev                          # local dev server
npm run typecheck                    # tsc --noEmit
npm run build                        # next build
npm run db:push                      # drizzle-kit push (NOT for generated columns)
npm run seed                         # seed taxonomy + demo data
npm run ingest:bulk                  # bulk ingest from Thai SEC API
```

When adding new scripts, follow the OpenClauses pattern:
`tsx --env-file=.env.local scripts/<name>.ts`

## Deployment patterns

- Production URL: `https://scg-thaisec.vercel.app` (rename Vercel project + add
  the alias domain after first deploy)
- Keep auto-generated `*-zeta.vercel.app` alias alive forever as fallback
- `vercel env pull` after any env var change in the Vercel dashboard
- For overnight long-running scripts (ingest, reclassify), run locally — Vercel
  Functions cap at 300s. Future cron support possible via Vercel Cron pointing
  at internal API routes that do work in chunks.

## When to ask vs. when to proceed

- **Ask** when you'd be making an irreversible product-shape decision (database
  schema additions that imply a feature, third-party integrations that cost
  money, anything touching billing/auth).
- **Proceed** for code-style decisions, file organization, test patterns,
  refactors that don't change behavior. Use judgment.
- **Always ask** before:
  - Deleting files or branches
  - Running destructive SQL
  - Pushing to main when you're uncertain
  - Adding paid services / changing pricing tiers
- **Never** make these decisions without explicit user consent:
  - Schema changes that require data migration
  - Adding auth (changes the threat model)
  - Custom domains (DNS implications)

## Tone / output style

- Concise responses; lead with what changed, not what's coming
- For code edits, show diffs not full files in chat
- Don't narrate routine tool calls
- Surface real warnings (build errors, schema mismatches) prominently; don't
  bury them in a wall of green checkmarks
- When the user is in the middle of a long-running script, never suggest they
  Ctrl+C unless it's actually broken

## What "done" looks like for ThaiSEC v1

- `/` with hero search + browse-by-X tiles + stats line
- `/search` with FTS + type filter
- `/[content-type]` and `/[content-type]/[id]` browse + detail pages
- Favorites (localStorage) + copy buttons on all content
- `/api/mcp` with read-only tools
- `/openapi.json` for ChatGPT Custom GPT
- `/connect` page with Claude/ChatGPT setup steps
- `/terms` page with SCG-only TOU
- `/about` with disclaimer
- Premium-UI pass applied (red ribbon, surfaces, eyebrows, tabular nums)
- Deployed to `scg-thaisec.vercel.app` with at least 1,000 indexed items

> When in doubt, look at the OpenClauses repo
> (https://github.com/lawyerbuilder/openclauses) — that's the architectural
> template. Same problems → same solutions unless there's a Thai-specific reason
> to deviate.
