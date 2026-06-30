/**
 * GET  /api/lawyers          → list all (admin view) — pass ?active=1 to filter
 * POST /api/lawyers          → create or upsert by email
 *
 * TODO(auth): gate POST with Clerk + role='admin'. GET stays public so the
 * upload form dropdown can populate without auth (we only return safe fields).
 */

import { NextResponse } from "next/server";
import { listLawyers, createLawyer } from "@/lib/lawyers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "1";
  const lawyers = await listLawyers({ activeOnly });
  return NextResponse.json({ lawyers });
}

export async function POST(req: Request) {
  let body: { email?: unknown; name?: unknown; role?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.email !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "email and name required" }, { status: 400 });
  }
  try {
    const lawyer = await createLawyer({
      email: body.email,
      name: body.name,
      role: body.role === "admin" ? "admin" : "lawyer",
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return NextResponse.json({ lawyer });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "create failed" },
      { status: 400 }
    );
  }
}
