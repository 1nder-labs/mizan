import { describe, expect, it } from "bun:test";
import { deterministicUnitFloat } from "../../../../packages/mastra/src/tools/deterministic-hash.ts";

describe("deterministicUnitFloat", () => {
  it("returns a value in the unit interval", async () => {
    const value = await deterministicUnitFloat("any:fixture-key");
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it("is deterministic for the same input", async () => {
    const a = await deterministicUnitFloat("salt-a:fixture-key");
    const b = await deterministicUnitFloat("salt-a:fixture-key");
    expect(a).toBe(b);
  });

  it("changes when the salt prefix changes for the same r2_key tail", async () => {
    const a = await deterministicUnitFloat("salt-a:shared-key");
    const b = await deterministicUnitFloat("salt-b:shared-key");
    expect(a).not.toBe(b);
  });

  it("changes when the r2_key tail changes for the same salt", async () => {
    const a = await deterministicUnitFloat("same-salt:key-a");
    const b = await deterministicUnitFloat("same-salt:key-b");
    expect(a).not.toBe(b);
  });
});
