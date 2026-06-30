/**
 * PATCH  /api/lawyers/[id]   → partial update (name, role, active, notes)
 * DELETE /api/lawyers/[id]   → soft-deactivate (active=false). We never hard-delete
 *                              because faqs.assigned_to references emails by string.
 */

import { NextResponse } from "next/server";
import { updateLawyer } from "@/lib/lawyers";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const role =
      body.role === "admin" || body.role === "verifier" || body.role === "user"
        ? body.role
        : undefined;
    const boolOrUndef = (k: string): boolean | undefined =>
      typeof body[k] === "boolean" ? (body[k] as boolean) : undefined;
    const lawyer = await updateLawyer({
      id,
      name: typeof body.name === "string" ? body.name : undefined,
      role,
      active: typeof body.active === "boolean" ? body.active : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      grantVerifyFaqs: boolOrUndef("grantVerifyFaqs"),
      grantEditFaqs: boolOrUndef("grantEditFaqs"),
      grantImproveFaqs: boolOrUndef("grantImproveFaqs"),
      grantGenerateFaqs: boolOrUndef("grantGenerateFaqs"),
      grantUpload: boolOrUndef("grantUpload"),
      grantManageRoster: boolOrUndef("grantManageRoster"),
    });
    if (!lawyer) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ lawyer });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "update failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const lawyer = await updateLawyer({ id, active: false });
  if (!lawyer) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ lawyer });
}
