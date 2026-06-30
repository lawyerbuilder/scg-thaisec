"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { verifyFaq, rejectFaq, updateFaqContent } from "@/lib/faqs";
import { db } from "@/lib/db";
import { sendFaqVerifiedEmail } from "@/lib/email";
import { getLawyerByEmail } from "@/lib/lawyers";
import { requirePermission } from "@/lib/auth";

// Role-gated. Each action calls requirePermission() from lib/auth.ts which
// reads the current-user cookie. Returns the actor's email for audit trails.
// When Clerk is wired, requirePermission() swaps to reading the Clerk session
// instead of the cookie — this file doesn't change.

export async function verifyFaqAction(faqId: number): Promise<void> {
  const email = await requirePermission("canVerifyFaq");
  const updated = await verifyFaq(faqId, email);
  revalidatePath(`/faq/${faqId}`);
  revalidatePath("/faq");

  // Notify the uploader-of-the-source-document that their FAQ was verified.
  // Skip self-notifications and silently noop if no uploader / no email key.
  if (updated) {
    try {
      const rows = await db.execute<{ uploaded_by: string | null }>(sql`
        SELECT r.uploaded_by
        FROM faqs f
        LEFT JOIN regulations r ON r.id = f.regulation_id
        WHERE f.id = ${faqId}
        LIMIT 1
      `);
      const uploader = rows.rows[0]?.uploaded_by;
      if (uploader && uploader !== email && uploader.includes("@") && !uploader.endsWith(".local")) {
        const lawyer = await getLawyerByEmail(uploader).catch(() => null);
        await sendFaqVerifiedEmail({
          to: uploader,
          recipientName: lawyer?.name ?? null,
          faqId,
          questionEnOrTh: updated.questionEn ?? updated.questionTh,
          verifierEmail: email,
        });
      }
    } catch {
      // Email is nice-to-have; never block the verify action on it
    }
  }
}

export async function rejectFaqAction(faqId: number): Promise<void> {
  const email = await requirePermission("canVerifyFaq");
  await rejectFaq(faqId, email);
  revalidatePath(`/faq/${faqId}`);
  revalidatePath("/faq");
}

export interface FaqEditPayload {
  questionTh: string;
  questionEn: string;
  answerTh: string;
  answerEn: string;
  topic: string;
}

/**
 * Bulk verify N FAQs in one call. Used by /faq list checkboxes. Same
 * auth stub as the single-row action — applies to ALL ids. Returns the
 * count actually flipped (was draft → verified). Already-verified rows
 * are no-ops.
 */
export async function bulkVerifyFaqsAction(faqIds: number[]): Promise<{ verified: number }> {
  const email = await requirePermission("canVerifyFaq");
  if (!Array.isArray(faqIds) || faqIds.length === 0) return { verified: 0 };
  let verified = 0;
  for (const id of faqIds) {
    const updated = await verifyFaq(id, email);
    if (updated && updated.status === "verified") verified += 1;
  }
  revalidatePath("/faq");
  return { verified };
}

/**
 * Bulk reject N FAQs.
 */
export async function bulkRejectFaqsAction(faqIds: number[]): Promise<{ rejected: number }> {
  const email = await requirePermission("canVerifyFaq");
  if (!Array.isArray(faqIds) || faqIds.length === 0) return { rejected: 0 };
  let rejected = 0;
  for (const id of faqIds) {
    const updated = await rejectFaq(id, email);
    if (updated && updated.status === "rejected") rejected += 1;
  }
  revalidatePath("/faq");
  return { rejected };
}

export async function updateFaqAction(
  faqId: number,
  payload: FaqEditPayload
): Promise<void> {
  await requirePermission("canEditFaq");
  await updateFaqContent(faqId, {
    questionTh: payload.questionTh.trim(),
    questionEn: payload.questionEn.trim() || null,
    answerTh: payload.answerTh.trim(),
    answerEn: payload.answerEn.trim() || null,
    topic: payload.topic.trim() || null,
  });
  revalidatePath(`/faq/${faqId}`);
  revalidatePath("/faq");
}
