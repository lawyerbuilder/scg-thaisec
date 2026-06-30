import Link from "next/link";
import { Lock, Shield, UserCheck } from "lucide-react";
import type { Role } from "@/lib/lawyers";

/**
 * "You don't have access" page rendered when a user without the required
 * permission lands on a gated route.
 */
export function RoleGate({
  required,
  page,
}: {
  required: Role;
  page: string;
}) {
  return (
    <div className="container py-20 max-w-xl">
      <div className="text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-amber-50 border border-amber-200 mb-5">
          <Lock className="h-6 w-6 text-amber-700" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {page} requires a higher role
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          You&apos;re signed in with a role that doesn&apos;t have access to this
          page. To open <strong>{page}</strong>, you need to be a{" "}
          <RoleInline role={required} />.
        </p>

        <div className="mt-8 surface p-5 text-left text-[13px] space-y-3">
          <p className="eyebrow">What each role can do</p>
          <RoleRow
            role="admin"
            icon={<Shield className="h-4 w-4 text-violet-600" />}
            description="Manage the lawyer roster, upload source documents, generate FAQs, and verify them."
          />
          <RoleRow
            role="verifier"
            icon={<UserCheck className="h-4 w-4 text-emerald-600" />}
            description="Review draft FAQs — verify, reject, or edit. Can use AI improve. Cannot manage the roster or upload documents."
          />
          <RoleRow
            role="user"
            icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
            description="Read-only — browse regulations and FAQs, use the AI ask box, but no edit/verify rights."
          />
        </div>

        <p className="mt-6 text-[12px] text-muted-foreground">
          Switch roles using the picker in the top-right of any page. If you
          need a different role, ask an admin to update your record in{" "}
          <Link href="/admin/lawyers" className="text-primary hover:underline">
            /admin/lawyers
          </Link>
          .
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm hover:border-foreground/30"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

function RoleInline({ role }: { role: Role }) {
  const cls =
    role === "admin"
      ? "bg-violet-50 text-violet-800 border-violet-200"
      : role === "verifier"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-block text-[11px] font-semibold uppercase tracking-wide border px-1.5 py-0.5 rounded ${cls}`}
    >
      {role}
    </span>
  );
}

function RoleRow({
  role,
  icon,
  description,
}: {
  role: Role;
  icon: React.ReactNode;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <RoleInline role={role} />
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
