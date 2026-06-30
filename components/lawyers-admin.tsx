"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Trash2,
  RotateCcw,
  Loader2,
  Save,
  Shield,
  AlertCircle,
  Settings,
  CheckCircle2,
  X,
} from "lucide-react";
import type { Lawyer, CapabilityGrants } from "@/lib/lawyers";

interface CapabilityDef {
  key: keyof CapabilityGrants;
  label: string;
  description: string;
}

const CAPABILITIES: CapabilityDef[] = [
  { key: "grantVerifyFaqs", label: "Verify FAQs", description: "Mark draft FAQs as verified or rejected" },
  { key: "grantEditFaqs", label: "Edit FAQs", description: "Rewrite questions, answers, topic" },
  { key: "grantImproveFaqs", label: "AI improve FAQs", description: "Use the AI rewrite suggestions" },
  { key: "grantGenerateFaqs", label: "Generate FAQs", description: "Create new FAQ drafts from a regulation" },
  { key: "grantUpload", label: "Upload documents", description: "Use the FAQ generator to ingest new source files" },
  { key: "grantManageRoster", label: "Manage roster", description: "Add/edit/deactivate other lawyers" },
];

export function LawyersAdmin({ initial }: { initial: Lawyer[] }) {
  const router = useRouter();
  const [lawyers, setLawyers] = useState<Lawyer[]>(initial);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "verifier" | "user">("verifier");
  const [adding, setAdding] = useState(false);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim() || adding) return;
    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/lawyers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim(),
          role: newRole,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      // Insert/upsert into local state
      const next = lawyers.filter((l) => l.id !== json.lawyer.id);
      setLawyers([json.lawyer, ...next].sort(sortLawyers));
      setNewEmail("");
      setNewName("");
      setNewRole("verifier");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function onPatch(id: number, patch: Partial<Lawyer>) {
    setError(null);
    try {
      const res = await fetch(`/api/lawyers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setLawyers((prev) =>
        prev.map((l) => (l.id === id ? json.lawyer : l)).sort(sortLawyers)
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-8">
      {/* Add form */}
      <section className="surface p-5">
        <p className="eyebrow mb-3">Add a lawyer</p>
        <form onSubmit={onAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email (e.g. somchai@scg.com)"
            className="h-10 px-3 rounded-md border border-border bg-card text-[14px]"
            required
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Display name (e.g. Somchai T.)"
            className="h-10 px-3 rounded-md border border-border bg-card text-[14px]"
            required
          />
          <select
            value={newRole}
            onChange={(e) =>
              setNewRole(e.target.value as "admin" | "verifier" | "user")
            }
            className="h-10 px-3 rounded-md border border-border bg-card text-[14px]"
          >
            <option value="user">User — read only (browse + AI ask)</option>
            <option value="verifier">Verifier — review &amp; edit FAQs</option>
            <option value="admin">Admin — upload docs, manage roster</option>
          </select>
          <button
            type="submit"
            disabled={!newEmail.trim() || !newName.trim() || adding}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {adding ? "Adding…" : "Add to roster"}
          </button>
        </form>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Adding an email that already exists re-activates it and updates name/role.
        </p>
      </section>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Roster */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <p className="eyebrow">Roster</p>
          <p className="text-[12px] text-muted-foreground tabular-nums">
            {lawyers.filter((l) => l.active).length} active ·{" "}
            {lawyers.filter((l) => !l.active).length} inactive
          </p>
        </div>
        {lawyers.length === 0 ? (
          <div className="surface p-8 text-center text-sm text-muted-foreground">
            No lawyers added yet. Use the form above.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium">Role</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lawyers.map((l) => (
                  <LawyerRow key={l.id} lawyer={l} onPatch={onPatch} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function LawyerRow({
  lawyer,
  onPatch,
}: {
  lawyer: Lawyer;
  onPatch: (id: number, patch: Partial<Lawyer>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(lawyer.name);
  const [role, setRole] = useState<"admin" | "verifier" | "user">(lawyer.role);
  const [pending, startTransition] = useTransition();
  const [showCaps, setShowCaps] = useState(false);

  function save() {
    startTransition(async () => {
      await onPatch(lawyer.id, { name, role });
      setEditing(false);
    });
  }

  async function toggleGrant(key: keyof CapabilityGrants) {
    await onPatch(lawyer.id, { [key]: !lawyer[key] });
  }

  const grantsEnabledCount =
    Number(lawyer.grantVerifyFaqs) +
    Number(lawyer.grantEditFaqs) +
    Number(lawyer.grantImproveFaqs) +
    Number(lawyer.grantGenerateFaqs) +
    Number(lawyer.grantUpload) +
    Number(lawyer.grantManageRoster);

  return (
    <>
    <tr className={`border-t border-border ${lawyer.active ? "" : "opacity-60"}`}>
      <td className="px-4 py-3">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-8 px-2 rounded border border-border bg-card text-[13px]"
          />
        ) : (
          <span className="font-medium">{lawyer.name}</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums text-muted-foreground">{lawyer.email}</td>
      <td className="px-4 py-3">
        {editing ? (
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "admin" | "verifier" | "user")
            }
            className="h-8 px-2 rounded border border-border bg-card text-[12px]"
          >
            <option value="user">User</option>
            <option value="verifier">Verifier</option>
            <option value="admin">Admin</option>
          </select>
        ) : lawyer.role === "admin" ? (
          <span className="inline-flex items-center gap-1 text-violet-700 text-[12px]">
            <Shield className="h-3 w-3" /> Admin
          </span>
        ) : lawyer.role === "verifier" ? (
          <span className="text-[12px] text-emerald-700">Verifier</span>
        ) : (
          <span className="text-[12px] text-muted-foreground">User</span>
        )}
      </td>
      <td className="px-4 py-3">
        {lawyer.active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px]">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[11px]">
            Inactive
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          {editing ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[12px] hover:border-foreground/30"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setName(lawyer.name);
                  setRole(lawyer.role);
                }}
                className="text-[12px] text-muted-foreground hover:text-foreground px-2"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowCaps((b) => !b)}
                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[12px] ${
                  showCaps
                    ? "border-violet-300 bg-violet-50 text-violet-800"
                    : "border-border bg-card hover:border-foreground/30"
                }`}
                title="Per-user capability grants"
              >
                <Settings className="h-3 w-3" />
                Caps{grantsEnabledCount > 0 ? ` (${grantsEnabledCount})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded border border-border bg-card px-2 py-1 text-[12px] hover:border-foreground/30"
              >
                Edit
              </button>
              {lawyer.active ? (
                <button
                  type="button"
                  onClick={() => onPatch(lawyer.id, { active: false })}
                  className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 text-rose-700 px-2 py-1 text-[12px] hover:bg-rose-100"
                >
                  <Trash2 className="h-3 w-3" /> Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onPatch(lawyer.id, { active: true })}
                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[12px] hover:border-foreground/30"
                >
                  <RotateCcw className="h-3 w-3" /> Reactivate
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
    {showCaps && (
      <tr className="bg-violet-50/30 border-t border-border">
        <td colSpan={5} className="px-4 py-4">
          <CapabilityGrid lawyer={lawyer} onToggle={toggleGrant} />
        </td>
      </tr>
    )}
    </>
  );
}

function CapabilityGrid({
  lawyer,
  onToggle,
}: {
  lawyer: Lawyer;
  onToggle: (key: keyof CapabilityGrants) => void | Promise<void>;
}) {
  if (lawyer.role === "admin") {
    return (
      <div className="text-[12px] text-muted-foreground inline-flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 text-violet-600" />
        Admins automatically have <strong>every capability</strong>. Per-user grants are ignored.
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow text-[10px] mb-2">
        Per-user capabilities for <strong>{lawyer.name}</strong>
      </p>
      <p className="text-[12px] text-muted-foreground mb-3">
        On top of the <strong>{lawyer.role}</strong> role defaults, grant
        specific extra capabilities by ticking the boxes below. Changes save
        instantly.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CAPABILITIES.map((cap) => {
          const isOn = lawyer[cap.key];
          const isRoleDefault = isCapabilityRoleDefault(cap.key, lawyer.role);
          return (
            <button
              key={cap.key}
              type="button"
              onClick={() => onToggle(cap.key)}
              disabled={isRoleDefault}
              title={
                isRoleDefault
                  ? `Part of the ${lawyer.role} role — always on`
                  : isOn
                    ? "Granted — click to revoke"
                    : "Not granted — click to grant"
              }
              className={`flex items-start gap-2.5 rounded-md border p-2.5 text-left text-[12px] transition-colors ${
                isRoleDefault
                  ? "border-emerald-200 bg-emerald-50 cursor-default"
                  : isOn
                    ? "border-violet-300 bg-violet-100 hover:border-violet-400"
                    : "border-border bg-card hover:border-foreground/30"
              }`}
            >
              <span
                className={`shrink-0 mt-0.5 h-4 w-4 rounded border inline-flex items-center justify-center ${
                  isRoleDefault
                    ? "bg-emerald-600 border-emerald-700 text-white"
                    : isOn
                      ? "bg-violet-600 border-violet-700 text-white"
                      : "border-border"
                }`}
              >
                {(isOn || isRoleDefault) && <CheckCircle2 className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-medium block">{cap.label}</span>
                <span className="text-muted-foreground block text-[11px] mt-0.5">
                  {cap.description}
                </span>
                {isRoleDefault && (
                  <span className="block text-[10px] text-emerald-700 mt-0.5 font-medium uppercase tracking-wide">
                    ✓ Role default
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Mirror of roleDefaults() in lib/auth.ts so the UI shows the same. */
function isCapabilityRoleDefault(key: keyof CapabilityGrants, role: Lawyer["role"]): boolean {
  if (role === "admin") return true;
  if (role === "verifier") {
    return (
      key === "grantVerifyFaqs" ||
      key === "grantEditFaqs" ||
      key === "grantImproveFaqs" ||
      key === "grantGenerateFaqs"
    );
  }
  return false;
}

function sortLawyers(a: Lawyer, b: Lawyer): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  return a.name.localeCompare(b.name);
}
