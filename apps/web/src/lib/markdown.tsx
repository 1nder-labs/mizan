/**
 * Safe markdown wrapper around `react-markdown` for brief copy.
 *
 * - `remark-gfm` enables tables + checkbox lists (read-only).
 * - `disallowedElements` blocks XSS vectors (`<script>`, `<iframe>`,
 *   `<object>`, `<embed>`) defensively; brief output is already
 *   schema-validated upstream, but defence in depth is cheap.
 * - Component overrides apply the design-system token classes so
 *   the rendered prose inherits typography from `globals.css`
 *   without `dangerouslySetInnerHTML`.
 */
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils.ts";

const DISALLOWED = ["script", "iframe", "object", "embed"];

const components: Components = {
  h1: ({ className, children, ...props }) => (
    <h1 className={cn("mt-4 text-xl font-semibold tracking-tight", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2 className={cn("mt-4 text-base font-semibold", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3
      className={cn(
        "mt-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ className, ...props }) => (
    <p className={cn("text-sm leading-relaxed text-foreground", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("ml-4 list-disc space-y-1 text-sm text-foreground marker:text-muted-foreground", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("ml-4 list-decimal space-y-1 text-sm text-foreground", className)} {...props} />
  ),
  li: ({ className, ...props }) => <li className={cn("leading-relaxed", className)} {...props} />,
  code: ({ className, ...props }) => (
    <code
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground",
        className,
      )}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "overflow-x-auto rounded-md border border-border bg-muted/60 p-3 text-xs",
        className,
      )}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <table className={cn("w-full border-collapse text-sm", className)} {...props} />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "border border-border bg-muted/40 px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td className={cn("border border-border px-2 py-1 text-sm", className)} {...props} />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("border-l-2 border-border pl-4 text-sm italic text-muted-foreground", className)}
      {...props}
    />
  ),
};

export function Markdown({ children }: { readonly children: string }): React.JSX.Element {
  return (
    <div className="max-w-[65ch] space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={DISALLOWED}
        unwrapDisallowed
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
