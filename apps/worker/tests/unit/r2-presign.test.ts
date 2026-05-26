import { describe, expect, test } from "bun:test";
import { signR2GetUrl } from "../../src/lib/r2-presign.ts";

const validInput = {
  accountId: "abc123def456",
  bucket: "mizan-uploads",
  objectKey: "creators/case-1/id.pdf",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  ttlSeconds: 300,
} as const;

describe("signR2GetUrl", () => {
  test("returns a presigned URL with AWS4 query-signature params", async () => {
    const result = await signR2GetUrl(validInput);
    const url = new URL(result.url);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(url.searchParams.get("X-Amz-Credential")).toContain("AKIAEXAMPLE");
  });

  test("expiresAt is approximately now + ttlSeconds * 1000", async () => {
    const before = Date.now();
    const { expiresAt } = await signR2GetUrl(validInput);
    const after = Date.now();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 300_000);
    expect(expiresAt).toBeLessThanOrEqual(after + 300_000);
  });

  test("encodes object key path segments without double-encoding slashes", async () => {
    const { url } = await signR2GetUrl({
      ...validInput,
      objectKey: "creators/abc def/id with space.pdf",
    });
    const pathname = new URL(url).pathname;
    expect(pathname).toBe("/mizan-uploads/creators/abc%20def/id%20with%20space.pdf");
    expect(pathname).not.toContain("%2F");
  });

  test("TTL below 60 seconds is rejected by zod", async () => {
    await expect(signR2GetUrl({ ...validInput, ttlSeconds: 30 })).rejects.toThrow();
  });

  test("TTL above 3600 seconds is rejected by zod", async () => {
    await expect(signR2GetUrl({ ...validInput, ttlSeconds: 7200 })).rejects.toThrow();
  });

  test("object key outside allowed prefixes is rejected", async () => {
    await expect(signR2GetUrl({ ...validInput, objectKey: "../secrets/api-key" })).rejects.toThrow();
  });

  test("each of the three allowed prefixes signs successfully", async () => {
    for (const prefix of ["creators/", "bank-statements/", "category-docs/"]) {
      const { url } = await signR2GetUrl({ ...validInput, objectKey: `${prefix}case-1/file.pdf` });
      expect(url).toContain(`/${prefix}case-1/file.pdf`);
    }
  });
});
