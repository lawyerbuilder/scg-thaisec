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
} from "lucide-react";
import type { Lawyer } from "@/lib/lawyers";

export function LawyersAdmin({ initial }: { initial: Lawyer[] }) {
  const router = useRouter();
  const [lawyers, setLawyers] = useState<Lawyer[]>(initial);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"lawyer" | "admin">("lawyer");
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
      setNewRole("lawyer");
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
            onChange={(e) => setNewRole(e.target.value as "lawyer" | "admin")}
            className="h-10 px-3 rounded-md border border-border bg-card text-[14px]"
          >
            <option value="lawyer">Lawyer (verifies FAQs)</option>
            <option value="admin">Admin (also manages roster)</option>
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
  const [role, setRole] = useState<"lawyer" | "admin">(lawyer.role);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await onPatch(lawyer.id, { name, role });
      setEditing(false);
    });
  }

  return (
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
            onChange={(e) => setRole(e.target.value as "lawyer" | "admin")}
            className="h-8 px-2 rounded border border-border bg-card text-[12px]"
          >
            <option value="lawyer">Lawyer</option>
            <option value="admin">Admin</option>
          </select>
        ) : lawyer.role === "admin" ? (
          <span className="inline-flex items-center gap-1 text-violet-700 text-[12px]">
            <Shield className="h-3 w-3" /> Admin
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">Lawyer</span>
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
  );
}

function sortLawyers(a: Lawyer, b: Lawyer): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  return a.name.localeCompare(b.name);
}
