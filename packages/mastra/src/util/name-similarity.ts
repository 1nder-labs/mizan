/**
 * Real Jaro-Winkler string similarity in [0,1], used as a SECONDARY detail for
 * the OCR name-match signal — never as the verdict. The PRIMARY verdict is the
 * vision-LLM's `matches_organizer_name`, a semantic judgment that survives the
 * transliteration (Mohammed / Muhammad / Mohamed), name-order, and dropped-
 * middle-name variance that pervades a global Muslim-charity platform and that a
 * character-distance metric false-flags. This score only quantifies surface-form
 * closeness for the reviewer.
 */

/** Lowercases, strips diacritics + punctuation, collapses whitespace. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Count of matching characters within the Jaro window + transposition tally. */
function countJaroMatches(
  a: string,
  b: string,
  window: number,
): { readonly matches: number; readonly transpositions: number } {
  const aMatched = Array.from({ length: a.length }, () => false);
  const bMatched = Array.from({ length: b.length }, () => false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches += 1;
      break;
    }
  }
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  return { matches, transpositions };
}

/** Jaro similarity in [0,1]. */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const { matches, transpositions } = countJaroMatches(a, b, window);
  if (matches === 0) return 0;
  const t = transpositions / 2;
  return (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
}

/**
 * Jaro-Winkler similarity in [0,1] over normalized names. Adds the standard
 * common-prefix boost (up to 4 chars, factor 0.1).
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  const base = jaro(na, nb);
  let prefix = 0;
  const maxPrefix = Math.min(4, na.length, nb.length);
  for (let i = 0; i < maxPrefix; i += 1) {
    if (na[i] === nb[i]) prefix += 1;
    else break;
  }
  return base + prefix * 0.1 * (1 - base);
}
