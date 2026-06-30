/**
 * Email notifications via Resend.
 *
 * All sends are best-effort — if RESEND_API_KEY is unset or the send fails,
 * we log and continue. Email is a nice-to-have layer; assignment workflow
 * still works without it (lawyers can check /faq?assignee=… manually).
 *
 * Env vars:
 *   RESEND_API_KEY — required to actually send (free tier 3k/mo at resend.com)
 *   EMAIL_FROM     — sender (defaults to onboarding@resend.dev — Resend's
 *                    no-config sandbox sender that only sends to YOUR verified
 *                    email). For production, set this to noreply@<your-domain>
 *                    after verifying the domain in Resend.
 */

import { Resend } from "resend";

const DEFAULT_FROM = "SCG ThaiSEC <onboarding@resend.dev>";

let cachedClient: Resend | null = null;
function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function send(args: SendArgs): Promise<boolean> {
  const c = client();
  if (!c) {
    console.warn(`[email] RESEND_API_KEY unset — would have sent: ${args.subject} → ${args.to}`);
    return false;
  }
  try {
    const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;
    const { error } = await c.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (error) {
      console.warn(`[email] send failed: ${error.message ?? JSON.stringify(error)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[email] send threw: ${(err as Error).message}`);
    return false;
  }
}

const SITE = process.env.THAISEC_SITE_URL ?? "https://scg-thaisec.vercel.app";

export interface FaqAssignmentEmail {
  to: string;
  recipientName?: string | null;
  documentTitle: string;
  faqCount: number;
}

export async function sendFaqAssignmentEmail(args: FaqAssignmentEmail): Promise<boolean> {
  const queueUrl = `${SITE}/faq?assignee=${encodeURIComponent(args.to)}&status=draft`;
  const greeting = args.recipientName ? `Hi ${args.recipientName.split(" ")[0]},` : "Hello,";

  const text = `${greeting}

${args.faqCount} new draft FAQ${args.faqCount === 1 ? "" : "s"} have been generated from "${args.documentTitle}" and assigned to you for verification.

Review your queue:
${queueUrl}

— SCG ThaiSEC
This is an internal SCG Legal tool. Not legal advice.`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.55">
  <div style="border-top:3px solid hsl(354,77%,42%);padding-top:24px"></div>
  <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#666;margin:0 0 8px">SCG ThaiSEC · Compliance research + FAQ workspace</p>
  <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">${args.faqCount} draft FAQ${args.faqCount === 1 ? "" : "s"} assigned to you</h2>
  <p>${greeting}</p>
  <p>${args.faqCount} new draft FAQ${args.faqCount === 1 ? " has" : "s have"} been generated from <strong>${escapeHtml(args.documentTitle)}</strong> and assigned to you for verification.</p>
  <p style="margin:24px 0">
    <a href="${queueUrl}" style="display:inline-block;background:hsl(354,77%,42%);color:white;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">Review your queue →</a>
  </p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px" />
  <p style="font-size:12px;color:#888;margin:0">Internal SCG Legal tool. Not legal advice. You can reply to this email — it goes to no one — change your notification settings on the FAQ page.</p>
</div>`;

  return send({
    to: args.to,
    subject: `${args.faqCount} draft FAQ${args.faqCount === 1 ? "" : "s"} assigned to you (${args.documentTitle})`,
    html,
    text,
  });
}

export interface FaqVerifiedEmail {
  to: string;
  recipientName?: string | null;
  faqId: number;
  questionEnOrTh: string;
  verifierEmail: string;
}

export async function sendFaqVerifiedEmail(args: FaqVerifiedEmail): Promise<boolean> {
  const faqUrl = `${SITE}/faq/${args.faqId}`;
  const greeting = args.recipientName ? `Hi ${args.recipientName.split(" ")[0]},` : "Hello,";

  const text = `${greeting}

An FAQ you uploaded has just been verified by ${args.verifierEmail}:

"${args.questionEnOrTh}"

View it:
${faqUrl}

— SCG ThaiSEC`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.55">
  <div style="border-top:3px solid hsl(354,77%,42%);padding-top:24px"></div>
  <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#666;margin:0 0 8px">SCG ThaiSEC · Verification</p>
  <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">An FAQ you uploaded was just verified ✅</h2>
  <p>${greeting}</p>
  <p>${escapeHtml(args.verifierEmail)} verified your FAQ:</p>
  <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #ddd;background:#fafafa;font-style:italic">${escapeHtml(args.questionEnOrTh)}</blockquote>
  <p style="margin:24px 0">
    <a href="${faqUrl}" style="display:inline-block;background:hsl(354,77%,42%);color:white;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">View the FAQ →</a>
  </p>
</div>`;

  return send({
    to: args.to,
    subject: `Your FAQ was verified by ${args.verifierEmail}`,
    html,
    text,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
