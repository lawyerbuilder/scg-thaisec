/**
 * POST /api/faq/ask
 * Body: { question: string }
 *
 * Runs the AI-powered FAQ lookup: matches an existing FAQ or drafts a new
 * answer grounded in the playbook. The client renders the response inline
 * on /faq.
 */

import { NextResponse } from "next/server";
import { askFaq } from "@/lib/faq-ask";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ error: "missing 'question' string" }, { status: 400 });
  }

  try {
    const result = await askFaq(body.question);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "ask failed" },
      { status: 500 }
    );
  }
}
