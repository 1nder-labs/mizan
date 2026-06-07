/**
 * Inline button styled as a policy-clause chip. Opens the citation
 * drawer on click. Monochrome chrome — source identity is encoded in
 * the clauseId prefix that's already visible; color is reserved for
 * semantic state only (forensic spec §3).
 *
 * Relevance is intentionally NOT visualised at the chip level —
 * reviewers need to compare clause density in prose; relevance lives
 * in the drawer where it has context.
 */
import { useState } from "react";
import type { PolicyClauseSource } from "@mizan/shared";
import { cn } from "@/lib/utils.ts";
import { CitationDrawer } from "./citation-drawer.tsx";

interface CitationChipProps {
  readonly clauseId: string;
  readonly source: PolicyClauseSource;
}

const SOURCE_STYLES: Readonly<Record<PolicyClauseSource, string>> = {
  zakat: "border-border bg-muted/60 text-foreground hover:bg-muted hover:border-foreground/20",
  safety: "border-border bg-muted/60 text-foreground hover:bg-muted hover:border-foreground/20",
};

export function CitationChip({ clauseId, source }: CitationChipProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "mx-0.5 inline-flex items-center rounded border px-1.5 py-[1px] font-mono text-[11px] uppercase tracking-wide tabular transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 hover:scale-[1.04]",
          SOURCE_STYLES[source],
        )}
        aria-label={`Open citation ${clauseId}`}
      >
        {clauseId}
      </button>
      <CitationDrawer clauseId={clauseId} source={source} open={open} onOpenChange={setOpen} />
    </>
  );
}
