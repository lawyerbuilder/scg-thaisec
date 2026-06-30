/**
 * Query + mutation helpers for the lawyers roster.
 *
 * Auth: NONE today — mutations are open. Phase C will gate /admin/* and the
 * underlying API routes via Clerk + role='admin'.
 */

import { sql } from "drizzle-orm";
import { db } from "./db";

export interface Lawyer extends Record<string, unknown> {
  id: number;
  email: string;
  name: string;
  role: "lawyer" | "admin";
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listLawyers(opts: { activeOnly?: boolean } = {}): Promise<Lawyer[]> {
  const onlyActive = opts.activeOnly ?? false;
  const filter = onlyActive ? sql`WHERE active IS TRUE` : sql``;
  const rows = await db.execute<Lawyer>(sql`
    SELECT
      id,
      email,
      name,
      role,
      active,
      notes,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "createdAt",
      to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "updatedAt"
    FROM lawyers
    ${filter}
    ORDER BY active DESC, name ASC
  `);
  return rows.rows as unknown as Lawyer[];
}

export async function getLawyerByEmail(email: string): Promise<Lawyer | null> {
  const rows = await db.execute<Lawyer>(sql`
    SELECT
      id, email, name, role, active, notes,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "createdAt",
      to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "updatedAt"
    FROM lawyers
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `);
  return (rows.rows[0] as unknown as Lawyer) ?? null;
}

export interface CreateLawyerInput {
  email: string;
  name: string;
  role?: "lawyer" | "admin";
  notes?: string | null;
}

export async function createLawyer(input: CreateLawyerInput): Promise<Lawyer> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name) throw new Error("email and name are required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid email");

  await db.execute(sql`
    INSERT INTO lawyers (email, name, role, notes)
    VALUES (${email}, ${name}, ${input.role ?? "lawyer"}, ${input.notes ?? null})
    ON CONFLICT (lower(email)) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      notes = EXCLUDED.notes,
      active = true,
      updated_at = now()
  `);
  const row = await getLawyerByEmail(email);
  if (!row) throw new Error("insert succeeded but read failed");
  return row;
}

export interface UpdateLawyerInput {
  id: number;
  name?: string;
  role?: "lawyer" | "admin";
  active?: boolean;
  notes?: string | null;
}

export async function updateLawyer(input: UpdateLawyerInput): Promise<Lawyer | null> {
  const sets: ReturnType<typeof sql>[] = [];
  if (input.name !== undefined) sets.push(sql`name = ${input.name.trim()}`);
  if (input.role !== undefined) sets.push(sql`role = ${input.role}`);
  if (input.active !== undefined) sets.push(sql`active = ${input.active}`);
  if (input.notes !== undefined) sets.push(sql`notes = ${input.notes}`);
  if (sets.length === 0) return readById(input.id);

  const setClause = sets.reduce<ReturnType<typeof sql>>(
    (acc, frag, i) => (i === 0 ? frag : sql`${acc}, ${frag}`),
    sql``
  );
  await db.execute(sql`
    UPDATE lawyers SET ${setClause}, updated_at = now() WHERE id = ${input.id}
  `);
  return readById(input.id);
}

async function readById(id: number): Promise<Lawyer | null> {
  const rows = await db.execute<Lawyer>(sql`
    SELECT
      id, email, name, role, active, notes,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "createdAt",
      to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "updatedAt"
    FROM lawyers WHERE id = ${id} LIMIT 1
  `);
  return (rows.rows[0] as unknown as Lawyer) ?? null;
}
