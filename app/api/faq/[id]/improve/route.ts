/**
 * POST /api/faq/[id]/improve
 *
 * Body: { questionTh, questionEn?, answerTh, answerEn? }
 * (Optional — falls back to the FAQ's stored values if omitted, so the lawyer
 *  can pass the current edit-form draft to be improved.)
 *
 * Returns ImprovementResponse from lib/faq-improve.ts.
 * TODO(auth): gate with Clerk allowlist.
 */

import { NextResponse } from "next/server";
import { improveFaq } from "@/lib/faq-improve";
import { getFaqById } from "@/lib/faqs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: {
    questionTh?: unknown;
    questionEn?: unknown;
    answerTh?: unknown;
    answerEn?: unknown;
    userInstruction?: unknown;
  } = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = await req.json();
    }
  } catch {
    // Empty or malformed body → fall back to stored FAQ values
  }

  const stored = await getFaqById(id);
  if (!stored) {
    return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
  }

  const currentQuestionTh =
    typeof body.questionTh === "string" && body.questionTh.trim()
      ? body.questionTh.trim()
      : stored.questionTh;
  const currentQuestionEn =
    typeof body.questionEn === "string" && body.questionEn.trim()
      ? body.questionEn.trim()
      : stored.questionEn;
  const currentAnswerTh =
    typeof body.answerTh === "string" && body.answerTh.trim()
      ? body.answerTh.trim()
      : stored.answerTh;
  const currentAnswerEn =
    typeof body.answerEn === "string" && body.answerEn.trim()
      ? body.answerEn.trim()
      : stored.answerEn;

  const userInstruction =
    typeof body.userInstruction === "string" ? body.userInstruction.slice(0, 500) : null;

  try {
    const result = await improveFaq({
      faqId: id,
      currentQuestionTh,
      currentQuestionEn,
      currentAnswerTh,
      currentAnswerEn,
      userInstruction,
    });
    return NextResponse.json(result);
  } catch (err) {
    const raw = (err as Error).message ?? "improve failed";
    // Clean up Groq's nested JSON error messages — show the lawyer a friendlier message.
    const friendly = raw.includes("json_validate_failed")
      ? "The AI generated invalid JSON after several attempts. Try rephrasing your instruction or click Improve again."
      : raw.length > 200
      ? raw.slice(0, 200) + "…"
      : raw;
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
