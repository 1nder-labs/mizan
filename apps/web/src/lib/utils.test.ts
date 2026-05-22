import { describe, expect, it } from "bun:test";
import { cn } from "./utils.ts";

describe("cn()", () => {
  it("merges multiple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("dedups conflicting Tailwind utilities (last wins via tailwind-merge)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("drops falsy values (false, null, undefined, 0, '')", () => {
    expect(cn("a", false, null, undefined, "")).toBe("a");
  });

  it("flattens arrays and objects per clsx semantics", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });

  it("returns empty string for no args", () => {
    expect(cn()).toBe("");
  });
});
