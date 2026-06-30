"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { verifyFaq, rejectFaq, updateFaqContent } from "@/lib/faqs";
import { db } from "@/lib/db";
import { sendFaqVerifiedEmail } from "@/lib/email";
import { getLawyerByEmail } from "@/lib/lawyers";

/**
 * TODO(auth): replace this with the Clerk-authenticated user's email and an
 * allowlist check. For MVP, anyone can verify/edit. The server-side guard
 * goes here — every mutation should call `getAllowedVerifier()` and 403 if
 * not allowlisted.
 *
 * When Clerk is installed:
 *   import { auth, currentUser } from "@clerk/nextjs/server";
 *   const user = await currentUser();
 *   if (!user) throw new Error("Unauthorized");
 *   const email = user.emailAddresses[0]?.emailAddress;
 *   if (!isAllowedVerifier(email)) throw new Error("Forbidden");
 *   return email;
 */
async function getVerifierEmail(): Promise<string> {
  return "preview@scg-thaisec.local";
}

export async function verifyFaqAction(faqId: number): Promise<void> {
  const email = await getVerifierEmail();
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
  const email = await getVerifierEmail();
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
  const email = await getVerifierEmail();
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
  const email = await getVerifierEmail();
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
  // Even though this is a mutation, we don't need the verifier email for
  // updates (only verify/reject record who acted). Auth gate still applies
  // once Clerk is wired.
  await getVerifierEmail();
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
