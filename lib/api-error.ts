import { NextResponse } from "next/server";

/**
 * Turn an unknown thrown value into a safe JSON error response.
 *
 * Logs the real error server-side (with an optional context tag) and returns
 * only a generic message to the client. Raw Postgres / Groq error strings can
 * leak schema names, SQL fragments, connection details, or provider internals,
 * so they must never reach the response body.
 */
export function apiError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
  opts?: { status?: number; context?: string }
): NextResponse {
  const status = opts?.status ?? 500;
  const tag = opts?.context ? `[${opts.context}] ` : "";
  console.error(`${tag}API error:`, err);
  return NextResponse.json({ error: fallback }, { status });
}
