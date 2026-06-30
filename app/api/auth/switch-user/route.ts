/**
 * POST /api/auth/switch-user
 * Body: { id: number | null }
 *
 * Sets (or clears, when id is null) the current-user cookie used by
 * lib/auth.ts to determine role-based permissions.
 *
 * Interim — replaced when Clerk is wired. No-secret: anyone with site
 * access can call this, by design.
 */
import { NextResponse } from "next/server";
import { CURRENT_USER_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const id = body.id;
  if (id !== null && (typeof id !== "number" || !Number.isFinite(id))) {
    return NextResponse.json({ error: "id must be a number or null" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, id });
  if (id === null) {
    res.cookies.set(CURRENT_USER_COOKIE, "", {
      path: "/",
      expires: new Date(0),
      sameSite: "lax",
    });
  } else {
    res.cookies.set(CURRENT_USER_COOKIE, String(id), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
      httpOnly: false, // so the client-side toggle can read it too
    });
  }
  return res;
}
