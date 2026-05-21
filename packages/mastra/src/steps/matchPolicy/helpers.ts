import type { VectorizeMatch } from "@cloudflare/workers-types";
import type { CaseContext } from "../../runtime/case-loader.ts";
import type { PartialBriefState } from "../../schemas/brief.ts";
import { PolicyCitationSchema, type PolicyCitation } from "../../schemas/brief.ts";
import type { Corpus } from "../../schemas/corpus.ts";

/** Builds the semantic query string from case context and extractor outputs. */
export function buildPolicyQuery(caseRow: CaseContext, inputData: PartialBriefState): string {
  const parts: string[] = [caseRow.story, caseRow.claimed_zakat_category ?? "", caseRow.category];
  const categoryDoc = inputData.extractions?.extractCategoryDocs;
  if (categoryDoc?.doc_kind === "medical") {
    parts.push(categoryDoc.treatment_summary, categoryDoc.provider_name);
  }
  if (categoryDoc?.doc_kind === "school") {
    parts.push(categoryDoc.tuition_summary, categoryDoc.institution_name);
  }
  if (categoryDoc?.doc_kind === "org_registration") {
    parts.push(categoryDoc.org_name, categoryDoc.jurisdiction);
  }
  const storyClaims = inputData.extractions?.extractStoryClaims?.claims ?? [];
  for (const claim of storyClaims) {
    parts.push(claim.claim, claim.supporting_text_snippet);
  }
  return parts.filter((part) => part.trim().length > 0).join(" ");
}

/** Chooses the Vectorize metadata filter source from the claimed Zakat category. */
export function resolvePolicySource(claimedZakatCategory: string | null): "zakat" | "safety" {
  const normalized = (claimedZakatCategory ?? "").trim().toLowerCase();
  if (normalized.length === 0 || normalized === "n/a" || normalized === "none") {
    return "safety";
  }
  return "zakat";
}

/** Maps committed corpus clauses to clauseId → excerpt lookup for citation text. */
export function resolveExcerptMap(corpora: readonly Corpus[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const corpus of corpora) {
    for (const clause of corpus.clauses) {
      map.set(clause.clauseId, `${clause.title}: ${clause.body}`);
    }
  }
  return map;
}

/** Converts a Vectorize match into a validated PolicyCitation, or null when metadata is incomplete. */
export function parseMatchToCitation(
  match: VectorizeMatch,
  excerptByClauseId: ReadonlyMap<string, string>,
): PolicyCitation | null {
  const clauseId = match.metadata?.clauseId;
  const source = match.metadata?.source;
  if (typeof clauseId !== "string" || clauseId.length === 0) return null;
  const excerpt = excerptByClauseId.get(clauseId);
  if (!excerpt) return null;
  const parsed = PolicyCitationSchema.safeParse({
    clauseId,
    source,
    excerpt,
    relevance: match.score,
  });
  return parsed.success ? parsed.data : null;
}
