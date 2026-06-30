/**
 * Interim auth for role-based access control.
 *
 * Real Clerk integration is the next phase — this module gives us
 * role-gating today via a cookie that stores the "logged in" lawyer's id.
 * Anyone with site access can switch users, so this is NOT secure — it's
 * a way to test and demo the role-gated UX before wiring real auth.
 *
 * When Clerk lands, swap getCurrentUser() to read the Clerk session and
 * look up the lawyer row by email. The rest of the codebase doesn't need
 * to change — every server action / page already calls these helpers.
 */

import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { Lawyer, Role } from "./lawyers";

// Note: lib/auth and lib/lawyers can't both import each other's runtime
// values (circular). We use the Lawyer type from lawyers, but never call
// its functions — auth queries the DB directly.

const COOKIE_NAME = "scg-thaisec-current-user-id";

/**
 * Get the currently "signed in" lawyer (per the cookie). Returns null if no
 * cookie is set OR the referenced lawyer is missing/deactivated. Public
 * pages should still work when this returns null.
 */
export async function getCurrentUser(): Promise<Lawyer | null> {
  const cookieStore = await cookies();
  const idStr = cookieStore.get(COOKIE_NAME)?.value;
  if (!idStr) return null;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return null;

  const rows = await db.execute<Lawyer>(sql`
    SELECT
      id, email, name, role, active, notes,
      grant_verify_faqs AS "grantVerifyFaqs",
      grant_edit_faqs AS "grantEditFaqs",
      grant_improve_faqs AS "grantImproveFaqs",
      grant_generate_faqs AS "grantGenerateFaqs",
      grant_upload AS "grantUpload",
      grant_manage_roster AS "grantManageRoster",
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "createdAt",
      to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "updatedAt"
    FROM lawyers WHERE id = ${id} AND active = true LIMIT 1
  `);
  return (rows.rows[0] as unknown as Lawyer) ?? null;
}

/**
 * Permissions matrix. The single source of truth for what each role can do.
 * Used by both server actions (to gate mutations) and UI components (to
 * hide buttons users can't use).
 */
export interface Permissions {
  canVerifyFaq: boolean;
  canEditFaq: boolean;
  canImproveFaq: boolean;
  canPromoteAiSuggestion: boolean;
  canUploadDocument: boolean;
  canGenerateFaqs: boolean;
  canManageRoster: boolean;
}

const NO_PERMISSIONS: Permissions = {
  canVerifyFaq: false,
  canEditFaq: false,
  canImproveFaq: false,
  canPromoteAiSuggestion: false,
  canUploadDocument: false,
  canGenerateFaqs: false,
  canManageRoster: false,
};

/**
 * Returns the base permissions a role gets out of the box.
 * Per-user grants are layered on top in `permissionsFor(user)`.
 */
function roleDefaults(role: Role | null): Permissions {
  if (!role || role === "user") return NO_PERMISSIONS;
  if (role === "verifier") {
    return {
      canVerifyFaq: true,
      canEditFaq: true,
      canImproveFaq: true,
      canPromoteAiSuggestion: true,
      canUploadDocument: false,
      canGenerateFaqs: true,
      canManageRoster: false,
    };
  }
  // admin — full power
  return {
    canVerifyFaq: true,
    canEditFaq: true,
    canImproveFaq: true,
    canPromoteAiSuggestion: true,
    canUploadDocument: true,
    canGenerateFaqs: true,
    canManageRoster: true,
  };
}

/**
 * Effective permissions for a user = role defaults OR per-user grants.
 * Admins ignore grants — they have everything by virtue of being admin.
 * `permissionsFor(role)` (no user) returns just role defaults — used in UI
 * helpers and the role-gate explainer where we don't have per-user data.
 */
export function permissionsFor(roleOrUser: Role | null | Lawyer): Permissions {
  if (roleOrUser && typeof roleOrUser === "object") {
    const user = roleOrUser as Lawyer;
    const base = roleDefaults(user.role);
    return {
      canVerifyFaq: base.canVerifyFaq || user.grantVerifyFaqs,
      canEditFaq: base.canEditFaq || user.grantEditFaqs,
      canImproveFaq: base.canImproveFaq || user.grantImproveFaqs,
      canPromoteAiSuggestion: base.canPromoteAiSuggestion || user.grantEditFaqs,
      canUploadDocument: base.canUploadDocument || user.grantUpload,
      canGenerateFaqs: base.canGenerateFaqs || user.grantGenerateFaqs,
      canManageRoster: base.canManageRoster || user.grantManageRoster,
    };
  }
  return roleDefaults(roleOrUser as Role | null);
}

export async function getCurrentPermissions(): Promise<Permissions> {
  const user = await getCurrentUser();
  return permissionsFor(user ?? null);
}

/**
 * Server-action guard. Throws if the current user lacks the permission.
 * Always returns the email of the actor for audit-trail purposes.
 */
export async function requirePermission(perm: keyof Permissions): Promise<string> {
  const user = await getCurrentUser();
  const perms = permissionsFor(user ?? null);
  if (!perms[perm]) {
    throw new Error(
      `Permission denied: '${perm}' requires a higher role. ` +
        `Current: ${user ? `${user.email} (${user.role})` : "not signed in"}`
    );
  }
  return user!.email;
}

export const CURRENT_USER_COOKIE = COOKIE_NAME;
