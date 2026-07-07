import { NextResponse } from "next/server";

/**
 * Best-effort in-memory rate limiter.
 *
 * A fixed-window counter keyed by an arbitrary string, held in process memory.
 * On Vercel this is per-instance, not global — Fluid Compute reuses instances,
 * so a single abuser hammering one route is still throttled, but a flood spread
 * across many cold instances can slip through. It adds no dependency and no
 * cost, which is the point: it stops casual LLM-spend abuse today. For a hard
 * global limit, swap the Map for Upstash Redis behind this same interface
 * (rateLimit / clientIp signatures stay put).
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
const MAX_ENTRIES = 10_000;

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

/** Drop expired buckets once the map grows large, so it can't leak memory. */
function sweep(now: number): void {
  if (store.size < MAX_ENTRIES) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

/**
 * Register one hit against `key`. Returns whether the caller is under the limit
 * for the current window, plus a Retry-After hint when they're not.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowSec: number }
): RateLimitResult {
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    sweep(now);
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, limit: opts.limit, remaining: opts.limit - 1, retryAfterSec: 0 };
  }

  if (existing.count >= opts.limit) {
    return {
      ok: false,
      limit: opts.limit,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    ok: true,
    limit: opts.limit,
    remaining: opts.limit - existing.count,
    retryAfterSec: 0,
  };
}

/** Best-effort client identifier from proxy headers (Vercel sets these). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Standard 429 response carrying a Retry-After header. */
export function tooManyRequests(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Rate limit exceeded. Please slow down and try again in a moment." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}
