import { CorpusSchema, type Corpus } from "../schemas/corpus.ts";
import safetyPolicyJson from "./safety-policy.json";
import zakatPolicyJson from "./zakat-policy.json";

const zakatCorpus = CorpusSchema.parse(zakatPolicyJson);
const safetyCorpus = CorpusSchema.parse(safetyPolicyJson);

/** Returns parsed zakat + safety corpora loaded at module init. */
export function loadPolicyCorpora(): readonly [Corpus, Corpus] {
  return [zakatCorpus, safetyCorpus];
}

/** Returns all clauseIds across both corpora. */
export function allCorpusClauseIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const corpus of loadPolicyCorpora()) {
    for (const clause of corpus.clauses) {
      ids.add(clause.clauseId);
    }
  }
  return ids;
}

/** Filters corpora by source when only one policy corpus is needed. */
export function corporaForSource(source?: "zakat" | "safety"): Corpus[] {
  const [zakat, safety] = loadPolicyCorpora();
  if (source === "zakat") return [zakat];
  if (source === "safety") return [safety];
  return [zakat, safety];
}

export { zakatCorpus, safetyCorpus };
