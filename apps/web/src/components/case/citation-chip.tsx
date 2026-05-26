/**
 * Inline button styled as a policy-clause chip. Opens the citation
 * drawer on click. Source-color border gives an at-a-glance scan of
 * citation density; the tactile inner ring + hover scale say
 * "interactive" without screaming.
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
  zakat:
    "border-indigo-300/80 bg-indigo-50/60 text-indigo-900 hover:bg-indigo-100/80 hover:border-indigo-400 shadow-[inset_0_0_0_1px_oklch(0.94_0.04_270/0.6)]",
  safety:
    "border-amber-300/80 bg-amber-50/60 text-amber-900 hover:bg-amber-100/80 hover:border-amber-400 shadow-[inset_0_0_0_1px_oklch(0.94_0.06_80/0.6)]",
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
