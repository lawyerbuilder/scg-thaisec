# SCG ThaiSEC

A library of Thai SEC notifications, regulations, and circulars built primarily
for the lawyers and compliance officers at SCG Legal. Sister project to
[SCG OpenClauses](https://scg-openclauses.vercel.app).

> **Intended for the internal use of SCG personnel only.** Not legal advice.
> Not affiliated with the SEC Thailand.

## Stack

Next.js 15 App Router · TypeScript · Tailwind v3 · Drizzle ORM + Neon
Postgres · Postgres FTS (tsvector + GIN) + `pg_trgm` for Thai · MCP server
at `/api/mcp` · OpenAPI 3.1 spec at `/openapi.json` · Deployed on Vercel.

## Local setup (Path B: local dev + Vercel deploy)

The order matters. From a fresh checkout:

1. `npm install`
2. `npm run typecheck && npm run build` — make sure the scaffold is healthy
3. `git init && git remote add origin git@github.com:lawyerbuilder/scg-thaisec.git && git push -u origin main`
4. Import on Vercel → first deploy will fail (no DB yet — expected)
5. Vercel → Storage → add Neon. `DATABASE_URL` auto-wires to all three envs.
6. **In Neon's SQL Editor, paste `drizzle/0000_init.sql` and run it.**
   Do not use `drizzle-kit push` for the initial migration — it can't model the
   `tsvector` generated columns or the `pg_trgm` GIN indexes.
7. `vercel link` → say yes when it offers to pull dev env vars into `.env.local`
8. `npm run seed` — bootstraps the regulation-type taxonomy
9. `npm run dev` and visit http://localhost:3000
10. `npm run ingest` — pulls a sample of regulations from capital.sec.or.th
11. Re-deploy on Vercel — second build succeeds with data.

## Ingestion

Set the working ref-id cursor + budget in `.env.local`:

```env
INGEST_REF_IDS=80,1,2,3,4
INGEST_MAX_DOCS=500
INGEST_MAX_MINUTES=20
```

Run `npm run ingest`. Ctrl+C is safe — in-flight inserts finish, and dedup
is on the unique `doc_id` index, so a re-run picks up where it stopped.

## File layout

```
app/
  layout.tsx, globals.css         · shell + design tokens
  page.tsx                         · homepage with hero search + browse tiles
  search/                          · FTS results page
  regulations/                     · list + detail
  types/                           · taxonomy
  favorites/                       · localStorage saved
  connect/                         · MCP + OpenAPI setup docs
  about/, terms/                   · static
  api/mcp/route.ts                 · MCP server (mcp-handler)
  api/regulations/*                · REST endpoints for the OpenAPI surface
  openapi.json/route.ts            · OpenAPI 3.1 spec
components/                        · shadcn-style + bespoke (cards, toggle…)
hooks/                             · use-locale (EN/TH)
lib/
  db/schema.ts, db/index.ts        · Drizzle schema + client
  search.ts                        · Thai/EN-aware query helpers
  utils.ts                         · cn(), formatDate(), containsThai()
scripts/                           · CLI scripts
  lib/                             · ingestion helpers (NRS scrape, PDF text)
  seed.ts                          · taxonomy bootstrap
  ingest.ts                        · sample / dev ingestion runner
drizzle/0000_init.sql              · raw SQL migration
```

## Source

Public NRS portal at <https://capital.sec.or.th/> (search) and
<https://publish.sec.or.th/nrs/> (PDFs). We index and attribute — we do not
republish.

## Licence

See `LICENSE`. Code is open source; data on this site originates from the SEC
Thailand and is governed by that publisher.
