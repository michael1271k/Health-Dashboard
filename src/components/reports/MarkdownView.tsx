'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Markdown renderer for reports.
 *
 * Replaced a hand-rolled parser that supported headings, pipe tables, bullets
 * and inline bold/code — and nothing else. Sentinel-7 needs fenced code blocks
 * (its ASCII header box, bar charts and TDEE ledger all depend on preserved
 * whitespace in a monospace font), plus ordered lists, links and rules. A parser
 * that grows those one at a time eventually becomes a worse CommonMark
 * implementation than the one on npm.
 *
 * Two rules the styling exists to enforce:
 *  · a code block SCROLLS, never wraps — the ASCII charts are fixed-width by
 *    construction, and on a phone every one of them is wider than the viewport;
 *  · a table scrolls inside its own container, so the page body never scrolls
 *    sideways.
 */
export function MarkdownView({ md }: { md: string }) {
  return (
    <div className="space-y-3 text-fluid-sm leading-relaxed text-text/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="font-heading font-bold text-fluid-xl text-text mt-4 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="font-heading font-bold text-fluid-lg text-text mt-4 first:mt-0 pb-1 border-b border-white/[0.07]">{children}</h2>,
          h3: ({ children }) => <h3 className="font-heading font-semibold text-fluid-base text-text mt-3">{children}</h3>,
          h4: ({ children }) => <h4 className="font-heading font-semibold text-fluid-sm text-text/90 mt-2">{children}</h4>,
          p: ({ children }) => <p className="leading-relaxed" dir="auto">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 marker:text-primary">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 marker:text-muted">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed" dir="auto">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 text-muted italic">{children}</blockquote>
          ),
          hr: () => <hr className="border-white/[0.08] my-4" />,
          a: ({ href, children }) => (
            // Links only ever arrive inside pasted report text — never hand the
            // opener window to something we didn't author.
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="text-text font-semibold">{children}</strong>,
          em: ({ children }) => <em className="text-muted">{children}</em>,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full text-fluid-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="text-muted">{children}</thead>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold border-b border-white/[0.08] whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-b border-white/[0.04] align-top helix-num tabular-nums text-text/90">{children}</td>
          ),
          code: ({ className, children, ...props }) => {
            // react-markdown tags a fenced block with `language-*`; inline code
            // has no class. Only the inline case gets a pill.
            const fenced = /language-/.test(className ?? '')
            if (fenced) return <code className={className} {...props}>{children}</code>
            return <code className="rounded px-1 py-px bg-white/[0.06] text-[0.92em] font-mono text-primary">{children}</code>
          },
          pre: ({ children }) => (
            <pre className="report-pre overflow-x-auto rounded-lg bg-black/25 border border-white/[0.07] p-3 text-[11px] leading-[1.45]">
              {children}
            </pre>
          ),
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  )
}
