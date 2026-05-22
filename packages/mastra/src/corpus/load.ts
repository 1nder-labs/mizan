import { CorpusSchema, type Corpus } from "../schemas/corpus.ts";
import safetyPolicyJson from "./safety-policy.json";
import zakatPolicyJson from "./zakat-policy.json";

function parseCorpus(label: string, raw: unknown): Corpus {
  const result = CorpusSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `${label} corpus JSON failed CorpusSchema.parse — fix packages/mastra/src/corpus/${label}-policy.json: ${result.error.message}`,
    );
  }
  return result.data;
}

let cached: { readonly zakat: Corpus; readonly safety: Corpus } | null = null;

function ensureCorpora(): { readonly zakat: Corpus; readonly safety: Corpus } {
  if (cached) return cached;
  cached = {
    zakat: parseCorpus("zakat", zakatPolicyJson),
    safety: parseCorpus("safety", safetyPolicyJson),
  };
  return cached;
}

export function loadPolicyCorpora(): readonly [Corpus, Corpus] {
  const { zakat, safety } = ensureCorpora();
  return [zakat, safety];
}

export function allCorpusClauseIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const corpus of loadPolicyCorpora()) {
    for (const clause of corpus.clauses) {
      ids.add(clause.clauseId);
    }
  }
  return ids;
}

export function corporaForSource(source?: "zakat" | "safety"): Corpus[] {
  const [zakat, safety] = loadPolicyCorpora();
  if (source === "zakat") return [zakat];
  if (source === "safety") return [safety];
  return [zakat, safety];
}
