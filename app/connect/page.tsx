import Link from "next/link";
import {
  Sparkles,
  Bot,
  MessageSquare,
  HelpCircle,
  Copy,
  ChevronRight,
} from "lucide-react";
import { ConnectCopyButton } from "@/components/connect-copy-button";

export const metadata = {
  title: "Use from AI",
};

const SITE = process.env.THAISEC_SITE_URL ?? "https://scg-thaisec.vercel.app";
const MCP_URL = `${SITE}/api/mcp`;
const OPENAPI_URL = `${SITE}/openapi.json`;
const DESKTOP_CONFIG = `{
  "mcpServers": {
    "scg-thaisec": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${MCP_URL}"]
    }
  }
}`;

export default function ConnectPage() {
  return (
    <div className="container py-14 max-w-3xl">
      <p className="eyebrow mb-2">Connect</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Use SCG ThaiSEC from your AI assistant
      </h1>
      <p className="mt-3 text-muted-foreground leading-relaxed">
        Ask Claude or ChatGPT questions about Thai SEC rules and the AGM
        playbook directly. The AI searches this library for you and answers
        with links back to the source — no copy-pasting documents into chat.
      </p>

      <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-[13px] text-emerald-900">
        <strong>Good news:</strong> the AI connection works even when the rest
        of the site has a password — you don&apos;t need to share the password
        to use it from Claude or ChatGPT.
      </div>

      {/* Three big option cards */}
      <section className="mt-10 space-y-4">
        <OptionCard
          badge="Recommended · Free"
          icon={<Sparkles className="h-5 w-5 text-violet-600" />}
          title="Option 1 — Claude.ai (in your browser)"
          subtitle="Works on the free Claude plan. About 2 minutes, one-time setup."
        >
          <ol className="space-y-4 text-[14px] leading-relaxed">
            <Step n={1}>
              Open a new browser tab and go to{" "}
              <ExternalA href="https://claude.ai/settings/connectors">
                claude.ai/settings/connectors
              </ExternalA>
              . If asked, sign in to Claude.
            </Step>
            <Step n={2}>
              Scroll down. Find and click the button labeled{" "}
              <strong>&ldquo;Add custom connector&rdquo;</strong>.
            </Step>
            <Step n={3}>
              A panel opens. Fill in just two fields:
              <ul className="mt-2 ml-5 list-disc space-y-1.5">
                <li>
                  <strong>Name:</strong> type <code className="rounded bg-muted px-1.5 py-0.5">SCG ThaiSEC</code>
                </li>
                <li>
                  <strong>URL:</strong> paste the address below (click the copy
                  button on the right):
                  <CopyableBlock value={MCP_URL} />
                </li>
              </ul>
              Leave everything else blank. Click <strong>Save</strong>.
            </Step>
            <Step n={4}>
              Close the settings page. Open a new chat at{" "}
              <ExternalA href="https://claude.ai/new">claude.ai/new</ExternalA>.
            </Step>
            <Step n={5}>
              Above the chat input box, look for a small{" "}
              <strong>tools / paperclip icon</strong> — click it, and make sure{" "}
              <strong>SCG ThaiSEC</strong> is toggled <strong>on</strong>.
            </Step>
            <Step n={6} done>
              You&apos;re done. Try asking Claude:{" "}
              <em>
                &ldquo;Use SCG ThaiSEC to tell me the quorum requirement for a
                Thai listed company AGM.&rdquo;
              </em>
            </Step>
          </ol>
        </OptionCard>

        <OptionCard
          badge="If you use the Claude app on your computer"
          icon={<Bot className="h-5 w-5 text-foreground" />}
          title="Option 2 — Claude Desktop (the downloaded app)"
          subtitle="A bit more involved because you edit a settings file. Skip this and use Option 1 if you can."
        >
          <ol className="space-y-4 text-[14px] leading-relaxed">
            <Step n={1}>
              Open the Claude Desktop app. Click the gear icon or{" "}
              <strong>Claude → Settings</strong> in the menu bar.
            </Step>
            <Step n={2}>
              In the left sidebar of Settings, click <strong>Developer</strong>.
            </Step>
            <Step n={3}>
              Click the <strong>Edit Config</strong> button. Your computer&apos;s
              text editor opens with a file called{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">
                claude_desktop_config.json
              </code>
              .
            </Step>
            <Step n={4}>
              Select <strong>everything</strong> in that file (Ctrl+A on
              Windows, Cmd+A on Mac), delete it, and paste this in its place:
              <CopyableBlock value={DESKTOP_CONFIG} multiline />
              <span className="block mt-2 text-[12px] text-muted-foreground">
                If you&apos;ve already added other connectors here, only add the{" "}
                <code>scg-thaisec</code> entry inside the existing{" "}
                <code>mcpServers</code> object — don&apos;t replace the whole
                file.
              </span>
            </Step>
            <Step n={5}>
              Save the file (Ctrl+S / Cmd+S). Close the editor.
            </Step>
            <Step n={6}>
              <strong>Fully quit</strong> Claude Desktop (not just close the
              window — actually quit it from the menu), then open it again.
            </Step>
            <Step n={7} done>
              Start a new chat. Ask:{" "}
              <em>&ldquo;What tools do you have available?&rdquo;</em> — you
              should see <code>scg-thaisec</code> in the list.
            </Step>
          </ol>
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-900">
            <strong>Heads up:</strong> Option 2 needs Node.js installed on your
            computer. If Claude Desktop later shows a red error mentioning{" "}
            <code>npx</code>, your computer doesn&apos;t have Node.js — switch
            to Option 1 instead, which doesn&apos;t need anything installed.
          </div>
        </OptionCard>

        <OptionCard
          badge="ChatGPT Plus only"
          icon={<MessageSquare className="h-5 w-5 text-foreground" />}
          title="Option 3 — ChatGPT (requires a paid ChatGPT Plus account)"
          subtitle="Custom GPTs only work on ChatGPT Plus ($20/month). Skip this if you don't already have Plus."
        >
          <ol className="space-y-4 text-[14px] leading-relaxed">
            <Step n={1}>
              Open{" "}
              <ExternalA href="https://chatgpt.com/gpts/editor">
                chatgpt.com/gpts/editor
              </ExternalA>{" "}
              in a new tab. Sign in if asked.
            </Step>
            <Step n={2}>
              At the top of the editor, click the <strong>Configure</strong>{" "}
              tab.
            </Step>
            <Step n={3}>
              Fill in these three fields:
              <ul className="mt-2 ml-5 list-disc space-y-1.5">
                <li>
                  <strong>Name:</strong>{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    SCG ThaiSEC Assistant
                  </code>
                </li>
                <li>
                  <strong>Description:</strong>{" "}
                  <CopyableBlock
                    value="Searches Thai SEC regulations and the SCG AGM compliance playbook. Bilingual (Thai + English)."
                  />
                </li>
                <li>
                  <strong>Instructions:</strong>
                  <CopyableBlock
                    multiline
                    value={`You are a Thai legal compliance assistant for SCG Legal. When the user asks anything about Thai SEC rules, AGM procedures, shareholder meetings, or compliance, ALWAYS use the SCG ThaiSEC actions to search the library first. Answer in the same language as the question (Thai or English). Always cite the source regulation or FAQ.`}
                  />
                </li>
              </ul>
            </Step>
            <Step n={4}>
              Scroll down to the <strong>Actions</strong> section. Click{" "}
              <strong>&ldquo;Create new action&rdquo;</strong>.
            </Step>
            <Step n={5}>
              Find the <strong>Schema</strong> section. Click{" "}
              <strong>&ldquo;Import from URL&rdquo;</strong> and paste this:
              <CopyableBlock value={OPENAPI_URL} />
              Click <strong>Import</strong>. The action list fills in.
            </Step>
            <Step n={6}>
              Under <strong>Authentication</strong>, leave it set to{" "}
              <strong>None</strong>.
            </Step>
            <Step n={7}>
              Click the green <strong>Create</strong> button at the top right.
              When asked who can use this GPT, choose <strong>Only me</strong>{" "}
              (or share to your SCG colleagues if appropriate).
            </Step>
            <Step n={8} done>
              The GPT appears in your ChatGPT sidebar. Click it and ask:{" "}
              <em>
                &ldquo;What does Thai SEC say about voting at shareholder
                meetings?&rdquo;
              </em>
            </Step>
          </ol>
        </OptionCard>
      </section>

      {/* What you can ask */}
      <section className="mt-14">
        <p className="eyebrow mb-2">Once it&apos;s connected</p>
        <h2 className="text-2xl font-semibold tracking-tight">
          What you can ask
        </h2>
        <p className="mt-2 text-muted-foreground text-[14px]">
          Ask in plain Thai or English. The AI searches the library and replies
          with citations. Some examples to try:
        </p>
        <ul className="mt-4 space-y-2 text-[14px]">
          <ExampleQ>
            What&apos;s the quorum requirement for a Thai listed company AGM?
          </ExampleQ>
          <ExampleQ thai>องค์ประชุมของบริษัทจดทะเบียนต้องมีกี่คน?</ExampleQ>
          <ExampleQ>
            Show me the SCG playbook on electronic shareholder meetings.
          </ExampleQ>
          <ExampleQ>
            Find FAQs about director elections that have been verified.
          </ExampleQ>
          <ExampleQ>
            Who can vote by proxy under Thai law? Cite the section.
          </ExampleQ>
          <ExampleQ thai>
            หากบริษัทไม่ได้กำหนดเรื่อง e-meeting ในข้อบังคับ จัดประชุม
            online ได้หรือไม่
          </ExampleQ>
        </ul>
      </section>

      {/* Troubleshooting */}
      <section className="mt-14">
        <p className="eyebrow mb-2">If something doesn&apos;t work</p>
        <h2 className="text-2xl font-semibold tracking-tight">
          Troubleshooting
        </h2>
        <div className="mt-4 space-y-4 text-[14px]">
          <Trouble q="The AI doesn't seem to use the tool">
            For the first few messages in a new chat, explicitly say{" "}
            <em>&ldquo;Use SCG ThaiSEC to look up …&rdquo;</em>. The AI usually
            learns to reach for it after a couple of turns.
          </Trouble>
          <Trouble q="Claude says the connector can't be reached">
            Paste this address into your browser&apos;s address bar:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">
              {MCP_URL}
            </code>
            . You should see a wall of JSON text — that&apos;s the connector
            working. If you get an error page instead, the site is briefly
            down; try again in a minute.
          </Trouble>
          <Trouble q="The Claude Desktop config file is empty / I can't find Edit Config">
            Use Option 1 (Claude.ai in the browser) instead. It works on the
            same free Claude account and doesn&apos;t need any file editing.
          </Trouble>
          <Trouble q="ChatGPT says 'Schema validation failed' when I import">
            Make sure you pasted the schema URL exactly:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">
              {OPENAPI_URL}
            </code>{" "}
            (no trailing slash, no extra spaces). Try again — sometimes it just
            needs a second attempt.
          </Trouble>
          <Trouble q="Nothing here matches what I'm seeing">
            <Link href="/about" className="text-primary hover:underline">
              About page
            </Link>{" "}
            has contact info, or ask the SCG ThaiSEC team directly.
          </Trouble>
        </div>
      </section>
    </div>
  );
}

function OptionCard({
  badge,
  icon,
  title,
  subtitle,
  children,
}: {
  badge: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <article className="surface p-6 sm:p-8">
      <div className="flex items-start gap-3 mb-4">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="inline-block rounded-full bg-muted text-muted-foreground border border-border px-2.5 py-0.5 text-[11px] mb-2">
            {badge}
          </p>
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </article>
  );
}

function Step({
  n,
  done,
  children,
}: {
  n: number;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={
          done
            ? "shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold border border-emerald-300"
            : "shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-foreground text-background text-[11px] font-semibold tabular-nums"
        }
      >
        {done ? "✓" : n}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </li>
  );
}

function CopyableBlock({ value, multiline }: { value: string; multiline?: boolean }) {
  return (
    <div className="relative mt-2 group">
      <pre
        className={`rounded-md border border-border bg-card px-3 py-2 text-[12px] font-mono overflow-x-auto whitespace-pre ${
          multiline ? "" : "break-all"
        }`}
      >
        <code>{value}</code>
      </pre>
      <ConnectCopyButton value={value} />
    </div>
  );
}

function ExternalA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  );
}

function ExampleQ({ thai, children }: { thai?: boolean; children: React.ReactNode }) {
  return (
    <li
      className={`flex items-start gap-2 text-foreground/85 ${
        thai ? "lang-th" : ""
      }`}
    >
      <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <span>&ldquo;{children}&rdquo;</span>
    </li>
  );
}

function Trouble({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="rounded-md border border-border bg-card p-4 group">
      <summary className="cursor-pointer text-[14px] font-medium inline-flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-muted-foreground" />
        {q}
      </summary>
      <div className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
        {children}
      </div>
    </details>
  );
}
