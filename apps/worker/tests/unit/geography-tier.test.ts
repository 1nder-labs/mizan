import { describe, expect, it } from "bun:test";
import { tierFor } from "@mizan/mastra";

describe("tierFor", () => {
  it("maps OFAC_ADJACENT seed geographies", () => {
    expect(tierFor("YE")).toBe("OFAC_ADJACENT");
    expect(tierFor("PS")).toBe("OFAC_ADJACENT");
    expect(tierFor("AF")).toBe("OFAC_ADJACENT");
  });

  it("maps AT_RISK geographies", () => {
    expect(tierFor("ET")).toBe("AT_RISK");
    expect(tierFor("SO")).toBe("AT_RISK");
    expect(tierFor("ML")).toBe("AT_RISK");
  });

  it("maps SAFE geography", () => {
    expect(tierFor("US")).toBe("SAFE");
  });

  it("maps OFAC geographies including Belarus and Sudan", () => {
    expect(tierFor("IR")).toBe("OFAC");
    expect(tierFor("KP")).toBe("OFAC");
    expect(tierFor("BY")).toBe("OFAC");
    expect(tierFor("SD")).toBe("OFAC");
    expect(tierFor("CU")).toBe("OFAC");
    expect(tierFor("RU")).toBe("OFAC");
    expect(tierFor("SY")).toBe("OFAC");
  });

  it("falls back to SAFE for unknown codes", () => {
    expect(tierFor("ZZ")).toBe("SAFE");
  });

  it("normalizes case and whitespace", () => {
    expect(tierFor("us")).toBe("SAFE");
    expect(tierFor(" US ")).toBe("SAFE");
    expect(tierFor("by")).toBe("OFAC");
    expect(tierFor("  ye  ")).toBe("OFAC_ADJACENT");
  });

  it("falls back to SAFE for empty input", () => {
    expect(tierFor("")).toBe("SAFE");
  });
});
