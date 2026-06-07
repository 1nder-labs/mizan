/**
 * Unit: `storeEvidence` writes R2 first, then inserts a `documents` row via
 * `insertDocumentIfOwned` — and compensates a failed OR no-op insert by
 * deleting the just-written object so a partial failure never leaves an R2
 * orphan the case can't reference. The integration suite can't force the insert
 * to fail after the R2 put, so the compensation is proven here with a db double
 * whose `.run()` controls the insert outcome.
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

/**
 * Builds a minimal db double whose `.run()` delegates to the provided thunk.
 * `insertDocumentIfOwned` calls `db.run(sql\`...\`)` and checks
 * `result.meta?.changes > 0` to determine whether a row was inserted.
 */
function fakeDb(runResult: () => Promise<{ meta?: { changes?: number } }>): Db {
  return {
    run: () => runResult(),
  } as unknown as Db;
}

function fakeEnv(put: () => Promise<unknown>, del: () => Promise<unknown>): CloudflareBindings {
  return { R2_BUCKET: { put, delete: del } } as unknown as CloudflareBindings;
}

const docKind: DocumentKey = "creator_id";

describe("storeEvidence", () => {
  it("deletes the just-written R2 object and rethrows when the db insert throws", async () => {
    const put = mock(() => Promise.resolve());
    const del = mock(() => Promise.resolve());
    const db = fakeDb(() => Promise.reject(new Error("d1 down")));

    await expect(
      storeEvidence(fakeEnv(put, del), db, viewer, "case-1", {
        file: fakeFile(),
        docKind,
        filename: "id.pdf",
        contentType: "application/pdf",
      }),
    ).rejects.toThrow("d1 down");
    expect(put).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("deletes the R2 object when the insert matches no row (case vanished)", async () => {
    const put = mock(() => Promise.resolve());
    const del = mock(() => Promise.resolve());
    const db = fakeDb(() => Promise.resolve({ meta: { changes: 0 } }));

    await expect(
      storeEvidence(fakeEnv(put, del), db, viewer, "case-3", {
        file: fakeFile(),
        docKind,
        filename: "id.pdf",
        contentType: "application/pdf",
      }),
    ).rejects.toThrow("matched no owned case");
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("returns a versioned key on success without deleting", async () => {
    const put = mock(() => Promise.resolve());
    const del = mock(() => Promise.resolve());
    const db = fakeDb(() => Promise.resolve({ meta: { changes: 1 } }));

    const key = await storeEvidence(fakeEnv(put, del), db, viewer, "case-2", {
      file: fakeFile(),
      docKind: "bank_statement",
      filename: "bank.pdf",
      contentType: "application/pdf",
    });
    expect(key.startsWith("case-2/bank_statement/")).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(0);
  });
});
