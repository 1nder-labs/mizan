/**
 * Pure segmentation for `wrapCitations` — kept JSX-free so the
 * longest-first / no-overlap / no-hallucination string-matching logic is
 * unit-testable without importing the `CitationChip` component chain.
 *
 * Algorithm: sort citations by `clauseId.length` DESC and place occurrences
 * longest-first so `zakat.5` cannot match inside `zakat.5.1`. Only clauseIds
 * that actually appear in the text are wrapped — a hallucinated id stays plain.
 */
import type { PolicyCitation, PolicyClauseSource } from "@mizan/shared";

export interface Segment {
  readonly start: number;
  readonly end: number;
  readonly chip: { clauseId: string; source: PolicyClauseSource } | null;
}

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

function overlaps(a: Segment, others: Segment[]): boolean {
  return others.some((other) => !(a.end <= other.start || a.start >= other.end));
}

export function buildSegments(text: string, citations: readonly PolicyCitation[]): Segment[] {
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
