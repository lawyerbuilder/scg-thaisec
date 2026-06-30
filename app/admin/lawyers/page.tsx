import { listLawyers } from "@/lib/lawyers";
import { LawyersAdmin } from "@/components/lawyers-admin";
import { getCurrentPermissions } from "@/lib/auth";
import { RoleGate } from "@/components/role-gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lawyers · Admin" };

export default async function LawyersAdminPage() {
  const perms = await getCurrentPermissions();
  if (!perms.canManageRoster) {
    return <RoleGate required="admin" page="Lawyers roster" />;
  }
  const initial = await listLawyers();
  return (
    <div className="container py-12 max-w-4xl">
      <p className="eyebrow">Admin</p>
      <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">
        Lawyers roster
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage the list of SCG Legal reviewers who appear in the &ldquo;Assign FAQs to&rdquo;
        dropdown on the FAQ generator. Email is the dedup key; deactivating
        hides a lawyer from the dropdown but preserves their audit trail on
        existing FAQs.
      </p>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 text-[12px] text-amber-900">
        <strong>Heads up:</strong> this page is open to anyone with the site
        password. Clerk-gated admin role is the next phase.
      </div>

      <div className="mt-8">
        <LawyersAdmin initial={initial} />
      </div>
    </div>
  );
}
