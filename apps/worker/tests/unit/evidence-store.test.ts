/**
 * Unit: `storeEvidence` writes R2 first, then the overlay key — and compensates
 * a failed overlay update by deleting the just-written object so a partial
 * failure never leaves an R2 orphan the case can't reference. The integration
 * suite can't force the overlay update to fail after the R2 put (a corrupt
 * overlay fails earlier, at the `mode: "json"` row load), so the compensation
 * is proven here with a failing-db double.
 */

import { describe, expect, it, mock } from "bun:test";
import { ViewerContextSchema, type DocumentKey } from "@mizan/shared";
import type { Db } from "@mizan/db";
import type { CloudflareBindings } from "../../src/env.ts";
import { storeEvidence } from "../../src/routes/portal/evidence-store.ts";

const viewer = ViewerContextSchema.parse({ userId: "u1", role: "client", organizationId: "o1" });

function fakeFile(): File {
  return { arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) } as unknown as File;
}

describe("storeEvidence", () => {
  it("deletes the just-written R2 object and rethrows when the overlay update fails", async () => {
    const put = mock(() => Promise.resolve());
    const del = mock(() => Promise.resolve());
    const env = { R2_BUCKET: { put, delete: del } } as unknown as CloudflareBindings;
    const db = {
      update: () => ({ set: () => ({ where: () => Promise.reject(new Error("d1 down")) }) }),
    } as unknown as Db;
    const docKind: DocumentKey = "creator_id";

    await expect(
      storeEvidence(env, db, viewer, "case-1", {
        file: fakeFile(),
        docKind,
        contentType: "application/pdf",
      }),
    ).rejects.toThrow("d1 down");
    expect(put).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("case-1/creator_id");
  });

  it("returns the deterministic key on success without deleting", async () => {
    const put = mock(() => Promise.resolve());
    const del = mock(() => Promise.resolve());
    const env = { R2_BUCKET: { put, delete: del } } as unknown as CloudflareBindings;
    const db = {
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    } as unknown as Db;
    const docKind: DocumentKey = "bank_statement";

    const key = await storeEvidence(env, db, viewer, "case-2", {
      file: fakeFile(),
      docKind,
      contentType: "application/pdf",
    });
    expect(key).toBe("case-2/bank_statement");
    expect(put).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(0);
  });
});
