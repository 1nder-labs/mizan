import { describe, expect, it } from "bun:test";
import type { PolicyCitation } from "@mizan/shared";
import { buildSegments } from "../../src/components/case/citation-segments.ts";

function cite(clauseId: string): PolicyCitation {
  return { clauseId, source: "zakat", excerpt: "x", relevance: 1 };
}

describe("buildSegments", () => {
  it("returns a single plain segment when no citation appears", () => {
    const segs = buildSegments("plain prose", [cite("zakat.5")]);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.chip).toBeNull();
  });

  it("wraps an occurring clauseId and keeps surrounding text plain", () => {
    const segs = buildSegments("see zakat.5 now", [cite("zakat.5")]);
    const chipped = segs.filter((s) => s.chip !== null);
    expect(chipped).toHaveLength(1);
    expect(chipped[0]?.chip?.clauseId).toBe("zakat.5");
    expect(segs.filter((s) => s.chip === null).length).toBeGreaterThan(0);
  });

  it("prefers the longer clauseId so a prefix cannot match inside it", () => {
    const segs = buildSegments("ref zakat.5.1 end", [cite("zakat.5"), cite("zakat.5.1")]);
    const chipped = segs.filter((s) => s.chip !== null);
    expect(chipped).toHaveLength(1);
    expect(chipped[0]?.chip?.clauseId).toBe("zakat.5.1");
  });

  it("never invents a match for a clauseId absent from the text", () => {
    const segs = buildSegments("nothing relevant here", [cite("zakat.9")]);
    expect(segs.every((s) => s.chip === null)).toBe(true);
  });

  it("wraps every occurrence of a repeated clauseId", () => {
    const segs = buildSegments("zakat.5 then zakat.5", [cite("zakat.5")]);
    expect(segs.filter((s) => s.chip !== null)).toHaveLength(2);
  });
});
