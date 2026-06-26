/**
 * POST /api/faq/promote
 * Body: { questionTh, questionEn, answerTh, answerEn, topic, groundedInRegulationId? }
 *
 * Saves an AI-suggested Q+A from /api/faq/ask into the faqs table as a real
 * draft. The lawyer reviewer is expected to edit + verify it after creation.
 *
 * TODO(auth): gate with Clerk allowlist — same TODO as everywhere else.
 */

import { NextResponse } from "next/server";
import { saveSuggestionAsDraft } from "@/lib/faq-ask";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: {
    questionTh?: unknown;
    questionEn?: unknown;
    answerTh?: unknown;
    answerEn?: unknown;
    topic?: unknown;
    groundedInRegulationId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const required = ["questionTh", "answerTh"] as const;
  for (const k of required) {
    if (typeof body[k] !== "string" || !(body[k] as string).trim()) {
      return NextResponse.json({ error: `missing '${k}'` }, { status: 400 });
    }
  }
  try {
    const id = await saveSuggestionAsDraft({
      questionTh: String(body.questionTh).trim(),
      questionEn: String(body.questionEn ?? body.questionTh).trim(),
      answerTh: String(body.answerTh).trim(),
      answerEn: String(body.answerEn ?? body.answerTh).trim(),
      topic: String(body.topic ?? "general").trim() || "general",
      groundedInRegulationId:
        typeof body.groundedInRegulationId === "number"
          ? body.groundedInRegulationId
          : null,
    });
    return NextResponse.json({ id, faqUrl: `/faq/${id}` });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "promote failed" },
      { status: 500 }
    );
  }
}
