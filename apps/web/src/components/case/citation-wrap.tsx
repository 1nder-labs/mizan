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

type ChipFactory = (clauseId: string, source: PolicyClauseSource, key: string) => ReactNode;

const defaultChipFactory: ChipFactory = (clauseId, source, key) => (
  <CitationChip key={key} clauseId={clauseId} source={source} />
);

function sortByLengthDesc(citations: readonly PolicyCitation[]): PolicyCitation[] {
  return citations.toSorted((a, b) => b.clauseId.length - a.clauseId.length);
}

function indicesOfAll(haystack: string, needle: string): number[] {
  const indices: number[] = [];
  if (needle.length === 0) return indices;
  let from = 0;
  while (true) {
    const hit = haystack.indexOf(needle, from);
    if (hit === -1) break;
    indices.push(hit);
    from = hit + needle.length;
  }
  return indices;
}

interface Segment {
  readonly start: number;
  readonly end: number;
  readonly chip: { clauseId: string; source: PolicyClauseSource } | null;
}

function overlaps(a: Segment, others: Segment[]): boolean {
  return others.some((other) => !(a.end <= other.start || a.start >= other.end));
}

function buildSegments(text: string, citations: readonly PolicyCitation[]): Segment[] {
  const matches: Segment[] = [];
  for (const citation of sortByLengthDesc(citations)) {
    for (const start of indicesOfAll(text, citation.clauseId)) {
      const candidate: Segment = {
        start,
        end: start + citation.clauseId.length,
        chip: { clauseId: citation.clauseId, source: citation.source },
      };
      if (!overlaps(candidate, matches)) matches.push(candidate);
    }
  }
  matches.sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) segments.push({ start: cursor, end: match.start, chip: null });
    segments.push(match);
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ start: cursor, end: text.length, chip: null });
  return segments;
}

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
