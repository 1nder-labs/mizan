import { describe, expect, it } from "bun:test";
import { tierFor } from "@mizan/mastra";

describe("tierFor", () => {
  it("maps OFAC_ADJACENT seed geographies", () => {
    expect(tierFor("YE")).toBe("OFAC_ADJACENT");
    expect(tierFor("SD")).toBe("OFAC_ADJACENT");
    expect(tierFor("PS")).toBe("OFAC_ADJACENT");
  });

  it("maps AT_RISK geography", () => {
    expect(tierFor("ET")).toBe("AT_RISK");
  });

  it("maps SAFE geography", () => {
    expect(tierFor("US")).toBe("SAFE");
  });

  it("maps OFAC geography", () => {
    expect(tierFor("IR")).toBe("OFAC");
    expect(tierFor("KP")).toBe("OFAC");
  });

  it("falls back to SAFE for unknown codes", () => {
    expect(tierFor("ZZ")).toBe("SAFE");
  });

  it("normalizes case and whitespace", () => {
    expect(tierFor("us")).toBe("SAFE");
    expect(tierFor(" US ")).toBe("SAFE");
  });

  it("falls back to SAFE for empty input", () => {
    expect(tierFor("")).toBe("SAFE");
  });
});
