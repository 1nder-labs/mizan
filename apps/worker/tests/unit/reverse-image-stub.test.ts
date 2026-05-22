import { describe, expect, it } from "bun:test";
import { reverseImageStub } from "@mizan/mastra";

const SALT = "11111111-1111-4111-8111-111111111101";

describe("reverseImageStub", () => {
  it("returns valid shape", async () => {
    const result = await reverseImageStub({ r2_key: "fixture-key-001", salt: SALT });
    expect(result.checked_at.length).toBeGreaterThan(0);
    expect(result.hits.length).toBeLessThanOrEqual(3);
    expect(result.hits.every((hit) => hit.confidence >= 0 && hit.confidence <= 1)).toBe(true);
  });

  it("is deterministic for hits given the same (key, salt) pair", async () => {
    const first = await reverseImageStub({ r2_key: "fixture-key-001", salt: SALT });
    const second = await reverseImageStub({ r2_key: "fixture-key-001", salt: SALT });
    expect(first.hits).toEqual(second.hits);
  });

  it("varies hits across keys for the same salt", async () => {
    const a = await reverseImageStub({ r2_key: "key-a", salt: SALT });
    const b = await reverseImageStub({ r2_key: "key-b", salt: SALT });
    expect(a.hits.length !== b.hits.length || a.hits[0]?.url !== b.hits[0]?.url).toBe(true);
  });

  it("varies hit count or confidence across salts for the same key", async () => {
    let differs = false;
    for (let i = 0; i < 20 && !differs; i += 1) {
      const a = await reverseImageStub({ r2_key: `shared-${i}`, salt: "salt-a" });
      const b = await reverseImageStub({ r2_key: `shared-${i}`, salt: "salt-b" });
      if (a.hits.length !== b.hits.length) {
        differs = true;
        break;
      }
      if (a.hits[0] && b.hits[0] && a.hits[0].confidence !== b.hits[0].confidence) {
        differs = true;
      }
    }
    expect(differs).toBe(true);
  });
});
