import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "SCG ThaiSEC — Thai SEC regulation library for SCG Legal",
    template: "%s · SCG ThaiSEC",
  },
  description:
    "An open-source library of Thai SEC notifications, regulations, and circulars built primarily for the lawyers and compliance officers at SCG Legal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border/60 mt-24 bg-card/40">
          <div className="container py-10 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-1 w-1 rounded-full bg-primary" />
              <span className="eyebrow text-foreground/80">SCG ThaiSEC</span>
            </div>
            <p className="max-w-3xl leading-relaxed">
              <strong className="text-foreground font-medium">
                Intended for the internal use of SCG personnel only.
              </strong>{" "}
              An open-source library of Thai SEC notifications, regulations, and circulars
              indexed from public sources at{" "}
              <a
                href="https://capital.sec.or.th/"
                className="underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer noopener"
              >
                capital.sec.or.th
              </a>{" "}
              and presented for reference and research only.{" "}
              <strong className="text-foreground font-medium">Not legal advice.</strong> No
              warranty; no liability. Not affiliated with the Securities and Exchange
              Commission, Thailand or any commercial regulation-library service.
            </p>
            <p className="mt-4 text-xs">
              <a href="/terms" className="hover:text-foreground transition-colors">
                Terms of Use
              </a>
              <span className="mx-2 text-border">·</span>
              <a href="/about" className="hover:text-foreground transition-colors">
                About
              </a>
              <span className="mx-2 text-border">·</span>
              <a
                href="https://github.com/lawyerbuilder/scg-thaisec"
                className="hover:text-foreground transition-colors"
                target="_blank"
                rel="noreferrer noopener"
              >
                Source on GitHub
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
