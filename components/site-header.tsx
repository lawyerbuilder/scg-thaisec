import Link from "next/link";
import { Suspense } from "react";
import { Scale } from "lucide-react";
import { SearchBar } from "./search-bar";
import { NavFavoritesLink } from "./nav-favorites-link";
import { LocaleToggle } from "./locale-toggle";
import { CurrentUserPicker } from "./current-user-picker";
import { countFaqs } from "@/lib/faqs";
import { getCurrentUser, permissionsFor } from "@/lib/auth";

export async function SiteHeader() {
  // Lightweight count for the nav badge — fails silently if DB is unreachable
  const draftCount = await countFaqs({ status: "draft" }).catch(() => 0);
  const currentUser = await getCurrentUser().catch(() => null);
  const perms = permissionsFor(currentUser?.role ?? null);
  return (
    <>
      {/* Thin authoritative red strip — the "official" signal */}
      <div className="brand-strip" />

      <header className="border-b border-border/60 sticky top-[3px] bg-background/95 backdrop-blur z-30">
        <div className="container h-16 flex items-center gap-8">
          {/* Identity block */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-transform group-hover:scale-105"
              aria-hidden
            >
              <Scale className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-tight">
                SCG <span className="text-muted-foreground font-medium">ThaiSEC</span>
              </span>
              <span className="eyebrow mt-1 text-[9px]">
                Compliance research + FAQ workspace
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground ml-2">
            <Link href="/regulations" className="hover:text-foreground transition-colors">
              Regulations
            </Link>
            <Link
              href="/faq"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1.5"
            >
              FAQ
              {draftCount > 0 && (
                <span
                  className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-1.5 min-w-[18px] h-[18px] text-[10px] font-semibold tabular-nums"
                  title={`${draftCount} draft FAQ${draftCount === 1 ? "" : "s"} awaiting review`}
                >
                  {draftCount > 99 ? "99+" : draftCount}
                </span>
              )}
            </Link>
            {perms.canUploadDocument && (
              <Link href="/upload" className="hover:text-foreground transition-colors">
                FAQ generator
              </Link>
            )}
            {perms.canManageRoster && (
              <Link href="/admin/lawyers" className="hover:text-foreground transition-colors">
                Lawyers
              </Link>
            )}
            <Link href="/types" className="hover:text-foreground transition-colors">
              Categories
            </Link>
            <NavFavoritesLink />
            <Link
              href="/connect"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
              Use from AI
            </Link>
            <Link href="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2 w-full max-w-md">
            <div className="hidden sm:block flex-1">
              <Suspense
                fallback={<div className="h-9 rounded-md border border-border/70 bg-card" />}
              >
                <SearchBar compact />
              </Suspense>
            </div>
            <LocaleToggle className="shrink-0" />
            <CurrentUserPicker current={currentUser} />
          </div>
        </div>
      </header>
    </>
  );
}
