import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  // We don't throw at import time so `next build` succeeds on environments
  // without a DB (CI typecheck, Vercel preview before Neon is wired). Queries
  // will throw on first use, with a clearer message at the call site.
  console.warn("[db] DATABASE_URL is not set — db queries will fail.");
}

const sql = neon(url ?? "postgresql://user:pass@host.neon.tech/db");
export const db = drizzle(sql, { schema });
export { schema };
