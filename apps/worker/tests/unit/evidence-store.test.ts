/**
 * Unit: `storeEvidence` writes R2 first, then the overlay key — and compensates
 * a failed OR no-op overlay update by deleting the just-written object so a
 * partial failure never leaves an R2 orphan the case can't reference. The
 * integration suite can't force the overlay update to fail after the R2 put (a
 * corrupt overlay fails earlier, at the `mode: "json"` row load), so the
 * compensation is proven here with a db double whose `.returning()` controls
 * the update outcome.
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

function fakeDb(returning: () => Promise<{ id: string }[]>): Db {
  return {
    update: () => ({ set: () => ({ where: () => ({ returning }) }) }),
  } as unknown as Db;
}

function fakeEnv(put: () => Promise<unknown>, del: () => Promise<unknown>): CloudflareBindings {
  return { R2_BUCKET: { put, delete: del } } as unknown as CloudflareBindings;
}

const docKind: DocumentKey = "creator_id";

describe("storeEvidence", () => {
  it("deletes the just-written R2 object and rethrows when the overlay update throws", async () => {
    const put = mock(() => Promise.resolve());
    const del = mock(() => Promise.resolve());
    const db = fakeDb(() => Promise.reject(new Error("d1 down")));

    await expect(
      storeEvidence(fakeEnv(put, del), db, viewer, "case-1", {
        file: fakeFile(),
        docKind,
        contentType: "application/pdf",
      }),
    ).rejects.toThrow("d1 down");
    expect(put).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("case-1/creator_id");
  });

  it("deletes the R2 object when the update matches no row (case vanished)", async () => {
    const put = mock(() => Promise.resolve());
    const del = mock(() => Promise.resolve());
    const db = fakeDb(() => Promise.resolve([]));

    await expect(
      storeEvidence(fakeEnv(put, del), db, viewer, "case-3", {
        file: fakeFile(),
        docKind,
        contentType: "application/pdf",
      }),
    ).rejects.toThrow("matched no owned case");
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("case-3/creator_id");
  });

  it("returns the deterministic key on success without deleting", async () => {
    const put = mock(() => Promise.resolve());
    const del = mock(() => Promise.resolve());
    const db = fakeDb(() => Promise.resolve([{ id: "case-2" }]));

    const key = await storeEvidence(fakeEnv(put, del), db, viewer, "case-2", {
      file: fakeFile(),
      docKind: "bank_statement",
      contentType: "application/pdf",
    });
    expect(key).toBe("case-2/bank_statement");
    expect(put).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(0);
  });
});
