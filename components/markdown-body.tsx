import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownBodyProps {
  source: string;
  isThai?: boolean;
}

/**
 * Renders markdown bodies for regulations / playbook content. Uses remark-gfm
 * for tables, strikethrough, and task-list support (the AGM playbook uses
 * stacked Thai/English markdown tables, so table support is required).
 *
 * Styling: leans on the `regulation-prose` class from globals.css plus a few
 * inline overrides for table fidelity since Tailwind's `prose` plugin isn't
 * installed.
 */
export function MarkdownBody({ source, isThai }: MarkdownBodyProps) {
  return (
    <div
      className={`regulation-prose text-foreground/90 ${isThai ? "lang-th" : ""}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-[13px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-2 text-left font-semibold align-top">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2 align-top whitespace-pre-wrap">
              {children}
            </td>
          ),
          p: ({ children }) => <p className="my-3 leading-relaxed">{children}</p>,
          h1: ({ children }) => (
            <h1 className="mt-6 mb-3 text-xl font-semibold tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 mb-2 text-lg font-semibold tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 mb-2 text-base font-semibold">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="my-3 ml-5 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 ml-5 list-decimal space-y-1">{children}</ol>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">
              {children}
            </code>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
