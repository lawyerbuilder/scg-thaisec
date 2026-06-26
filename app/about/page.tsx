import Link from "next/link";

export const metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <div className="container py-16 max-w-3xl">
      <p className="eyebrow mb-2">About</p>
      <h1 className="text-3xl font-semibold tracking-tight">SCG ThaiSEC</h1>

      <div className="mt-6 prose prose-sm max-w-none text-foreground/90 leading-relaxed space-y-4">
        <p>
          SCG ThaiSEC is an open-source library of Thai SEC notifications, regulations, and
          circulars built primarily for the lawyers and compliance officers at SCG Legal. It
          indexes content published by the{" "}
          <a
            href="https://capital.sec.or.th/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            Securities and Exchange Commission, Thailand
          </a>{" "}
          on its public NRS (Notifications, Regulations &amp; Standards) portal.
        </p>

        <p>
          Every regulation links back to its canonical source on capital.sec.or.th and
          publish.sec.or.th — we don&apos;t mirror or republish content, we index and
          attribute. Use this site to find what you need fast, then go to the official source
          to read and cite.
        </p>

        <p>
          The project is a sister library to{" "}
          <a
            href="https://scg-openclauses.vercel.app"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            SCG OpenClauses
          </a>{" "}
          (US SEC EDGAR contract clauses) and shares its architecture: Next.js 15, Drizzle
          ORM on Neon Postgres, MCP server at <code>/api/mcp</code>, OpenAPI for ChatGPT
          Custom GPTs.
        </p>

        <h2 className="text-lg font-semibold tracking-tight mt-8">Use from AI</h2>
        <p>
          The library exposes an MCP server and an OpenAPI schema so Claude and ChatGPT can
          search and cite regulations directly.{" "}
          <Link href="/connect" className="text-primary hover:underline">
            Setup steps →
          </Link>
        </p>

        <h2 className="text-lg font-semibold tracking-tight mt-8">Not legal advice</h2>
        <p>
          The contents of this site are presented for reference and research only, not as
          legal advice. No warranty; no liability. SCG ThaiSEC is not affiliated with the SEC
          Thailand. For authoritative text, always consult the original PDF on
          publish.sec.or.th.
        </p>

        <p className="text-xs text-muted-foreground pt-6 border-t border-border/60 mt-8">
          Source code:{" "}
          <a
            href="https://github.com/lawyerbuilder/scg-thaisec"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground transition-colors"
          >
            github.com/lawyerbuilder/scg-thaisec
          </a>
        </p>
      </div>
    </div>
  );
}
