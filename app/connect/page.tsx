import Link from "next/link";

export const metadata = {
  title: "Use from AI",
};

const SITE = process.env.THAISEC_SITE_URL ?? "https://scg-thaisec.vercel.app";
const MCP_URL = `${SITE}/api/mcp`;
const OPENAPI_URL = `${SITE}/openapi.json`;

export default function ConnectPage() {
  return (
    <div className="container py-14 max-w-3xl">
      <p className="eyebrow mb-2">Connect</p>
      <h1 className="text-3xl font-semibold tracking-tight">Use SCG ThaiSEC from AI</h1>
      <p className="mt-3 text-muted-foreground leading-relaxed">
        The library exposes an MCP server (Claude) and an OpenAPI schema (ChatGPT Custom
        GPTs). Both are read-only — search, fetch, and list, no writes.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="surface p-4">
          <p className="eyebrow mb-1">MCP server URL</p>
          <code className="block break-all text-[12px] font-mono">{MCP_URL}</code>
        </div>
        <div className="surface p-4">
          <p className="eyebrow mb-1">OpenAPI schema</p>
          <code className="block break-all text-[12px] font-mono">{OPENAPI_URL}</code>
        </div>
      </div>

      <section className="mt-12 space-y-10 text-sm leading-relaxed">
        <article>
          <h2 className="text-xl font-semibold tracking-tight mb-2">Claude.ai (Web)</h2>
          <p className="text-muted-foreground">
            Easiest option. Go to{" "}
            <a
              href="https://claude.ai/settings/connectors"
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary hover:underline"
            >
              claude.ai/settings/connectors
            </a>{" "}
            → <strong>Add custom connector</strong> → paste{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5">{MCP_URL}</code>. Save,
            then enable it in any new chat.
          </p>
        </article>

        <article>
          <h2 className="text-xl font-semibold tracking-tight mb-2">Claude Desktop</h2>
          <p className="text-muted-foreground">
            Settings → Developer → Edit Config. Add:
          </p>
          <pre className="mt-3 surface p-4 text-[12px] overflow-x-auto"><code>{`{
  "mcpServers": {
    "scg-thaisec": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${MCP_URL}"]
    }
  }
}`}</code></pre>
          <p className="mt-2 text-muted-foreground">Then restart Claude Desktop.</p>
        </article>

        <article>
          <h2 className="text-xl font-semibold tracking-tight mb-2">Claude Code (CLI)</h2>
          <p className="text-muted-foreground">One command:</p>
          <pre className="mt-3 surface p-4 text-[12px] overflow-x-auto"><code>{`claude mcp add --transport http scg-thaisec ${MCP_URL}`}</code></pre>
        </article>

        <article>
          <h2 className="text-xl font-semibold tracking-tight mb-2">ChatGPT Custom GPT</h2>
          <p className="text-muted-foreground">
            Create a new GPT → Configure → Actions → Import from URL. Paste{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5">{OPENAPI_URL}</code>.
            Authentication: None.
          </p>
        </article>

        <article>
          <h2 className="text-xl font-semibold tracking-tight mb-2">Tools exposed</h2>
          <ul className="mt-2 space-y-2 text-muted-foreground">
            <li>
              <code className="text-foreground">search_regulations</code> — FTS with optional
              category filter
            </li>
            <li>
              <code className="text-foreground">get_regulation</code> — full text + metadata
              by ID
            </li>
            <li>
              <code className="text-foreground">list_regulation_types</code> — the bilingual
              taxonomy with per-category counts
            </li>
            <li>
              <code className="text-foreground">find_related_regulations</code> — same-category
              peers
            </li>
            <li>
              <code className="text-foreground">list_recent_regulations</code> — newest
              ingested
            </li>
          </ul>
        </article>

        <article className="surface p-4 text-xs text-muted-foreground">
          Need help? See{" "}
          <Link href="/about" className="text-primary hover:underline">
            About
          </Link>{" "}
          for project context, or open an issue on{" "}
          <a
            href="https://github.com/lawyerbuilder/scg-thaisec"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            GitHub
          </a>
          .
        </article>
      </section>
    </div>
  );
}
