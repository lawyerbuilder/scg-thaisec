/**
 * Site-wide basic-auth gate.
 *
 * Reads `SITE_PASSWORD` from env. If set, every request outside the
 * `matcher` exclusions must include a matching HTTP Basic password.
 * If `SITE_PASSWORD` is unset (e.g. on localhost where you don't want a
 * prompt every page load), the middleware passes through.
 *
 * Excludes:
 *   - /api/mcp/* — MCP must stay reachable for Claude / ChatGPT clients.
 *     Proper auth on MCP write tools is a separate TODO (Clerk).
 *   - Next.js static assets and favicons.
 *
 * Username is ignored — any username works as long as the password matches.
 * Set the password in Vercel → Settings → Environment Variables → SITE_PASSWORD.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  // Match every path EXCEPT the listed exclusions.
  matcher: [
    "/((?!api/mcp|_next/static|_next/image|favicon\\.ico|apple-touch-icon|robots\\.txt|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)).*)",
  ],
};

export function middleware(req: NextRequest) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    // No password configured — open access (e.g. local dev)
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const colonIdx = decoded.indexOf(":");
      const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;
      if (password === expected) {
        return NextResponse.next();
      }
    } catch {
      // Malformed header — fall through to challenge
    }
  }

  return new NextResponse(
    "Authentication required. This is an internal SCG Legal tool.",
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="SCG ThaiSEC internal tool"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    }
  );
}
