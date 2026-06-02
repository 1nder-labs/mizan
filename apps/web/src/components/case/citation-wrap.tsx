/**
 * `wrapCitations(text, citations)` — splits prose on each known
 * `clauseId` and wraps every occurrence with `<CitationChip />`.
 *
 * Algorithm: sort citations by `clauseId.length` DESC and replace
 * occurrences longest-first so that `zakat.5` cannot match inside
 * `zakat.5.1`. Citations that don't appear in the text are silently
 * ignored. We never invent matches — only what the brief actually
 * cited gets chipped, so a hallucinated clauseId in prose stays plain
 * text.
 */
import type { ReactNode } from "react";
import type { PolicyCitation } from "@mizan/shared";
import type { PolicyClauseSource } from "@mizan/shared";
import { CitationChip } from "./citation-chip.tsx";
import { buildSegments } from "./citation-segments.ts";

type ChipFactory = (clauseId: string, source: PolicyClauseSource, key: string) => ReactNode;

const defaultChipFactory: ChipFactory = (clauseId, source, key) => (
  <CitationChip key={key} clauseId={clauseId} source={source} />
);

/**
 * Public helper consumed by `brief-details.tsx` and `brief-summary.tsx`.
 * The second arg is the brief's `policy_citations` array — only
 * matches in this list are wrapped.
 */
export function wrapCitations(
  text: string,
  citations: readonly PolicyCitation[],
  chipFactory: ChipFactory = defaultChipFactory,
): ReactNode[] {
  if (citations.length === 0 || text.length === 0) return [text];
  const segments = buildSegments(text, citations);
  return segments.map((segment, index) => {
    const slice = text.slice(segment.start, segment.end);
    if (segment.chip) {
      return chipFactory(
        segment.chip.clauseId,
        segment.chip.source,
        `chip-${index}-${segment.start}`,
      );
    }
    return <span key={`text-${index}-${segment.start}`}>{slice}</span>;
  });
}
