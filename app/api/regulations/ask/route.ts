import { NextResponse } from "next/server";
import { askRegulations } from "@/lib/regulation-ask";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const rl = rateLimit(`regulations:ask:${clientIp(req)}`, { limit: 20, windowSec: 60 });
  if (!rl.ok) return tooManyRequests(rl);

  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ error: "missing 'question'" }, { status: 400 });
  }
  try {
    const result = await askRegulations(body.question);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "ask failed" },
      { status: 500 }
    );
  }
}
