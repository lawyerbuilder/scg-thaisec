"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Shield, UserCheck, User as UserIcon, ChevronDown, LogOut, Loader2 } from "lucide-react";
import type { Role } from "@/lib/lawyers";

interface LawyerLite {
  id: number;
  email: string;
  name: string;
  role: Role;
}

interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export function CurrentUserPicker({ current }: { current: CurrentUser | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lawyers, setLawyers] = useState<LawyerLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Lazy-load lawyers when dropdown opens
  useEffect(() => {
    if (!open || lawyers.length > 0) return;
    setLoading(true);
    fetch("/api/lawyers?active=1")
      .then((r) => r.json())
      .then((j) => setLawyers((j.lawyers ?? []) as LawyerLite[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, lawyers.length]);

  async function switchTo(id: number | null) {
    setSwitching(true);
    try {
      await fetch("/api/auth/switch-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] transition-colors ${
          current
            ? "border-border bg-card hover:border-foreground/30"
            : "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {current ? (
          <>
            <RoleIcon role={current.role} />
            <span className="font-medium">{current.name.split(" ")[0]}</span>
            <span className="text-muted-foreground">· {current.role}</span>
          </>
        ) : (
          <>
            <UserIcon className="h-3.5 w-3.5" />
            <span>Not signed in</span>
          </>
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-72 rounded-md border border-border bg-card shadow-lg z-40 overflow-hidden"
        >
          <div className="px-3 py-2 bg-muted/50 border-b border-border">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Sign in as
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Interim — Clerk auth coming next. Anyone with site access can switch.
            </p>
          </div>
          {loading ? (
            <div className="p-4 text-[12px] text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading roster…
            </div>
          ) : lawyers.length === 0 ? (
            <div className="p-4 text-[12px] text-muted-foreground">
              No lawyers in roster. Add some at <a href="/admin/lawyers" className="text-primary hover:underline">/admin/lawyers</a>.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {lawyers.map((l) => {
                const isCurrent = current?.id === l.id;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      disabled={switching}
                      onClick={() => switchTo(l.id)}
                      className={`w-full px-3 py-2 text-left text-[12px] inline-flex items-center gap-2 transition-colors ${
                        isCurrent
                          ? "bg-violet-50 text-violet-900"
                          : "hover:bg-muted"
                      }`}
                    >
                      <RoleIcon role={l.role} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{l.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{l.email}</div>
                      </div>
                      <RoleBadge role={l.role} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {current && (
            <div className="border-t border-border">
              <button
                type="button"
                disabled={switching}
                onClick={() => switchTo(null)}
                className="w-full px-3 py-2 text-left text-[12px] inline-flex items-center gap-2 text-muted-foreground hover:bg-muted"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out (browse as anonymous)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RoleIcon({ role }: { role: Role }) {
  if (role === "admin") return <Shield className="h-3.5 w-3.5 text-violet-600" />;
  if (role === "verifier") return <UserCheck className="h-3.5 w-3.5 text-emerald-600" />;
  return <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />;
}

function RoleBadge({ role }: { role: Role }) {
  if (role === "admin") {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
        Admin
      </span>
    );
  }
  if (role === "verifier") {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
        Verifier
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded">
      User
    </span>
  );
}
