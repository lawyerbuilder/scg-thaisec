"use server";

import { revalidatePath } from "next/cache";
import { verifyFaq, rejectFaq, updateFaqContent } from "@/lib/faqs";

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
  await verifyFaq(faqId, email);
  revalidatePath(`/faq/${faqId}`);
  revalidatePath("/faq");
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
