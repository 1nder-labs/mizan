import { and, cases, eq, insertDocumentIfOwned, type Db } from "@mizan/db";
import type { DocumentKind, ViewerContext } from "@mizan/shared";
import type { CloudflareBindings } from "../../env.ts";
import { documentKey } from "./evidence-upload.ts";

export interface EvidenceObject {
  readonly file: File;
  readonly docKind: DocumentKind;
  readonly filename: string;
  readonly contentType: string;
}

/**
 * Deletes an R2 object, swallowing + logging a delete failure so the caller's
 * ORIGINAL error (the reason we are compensating) is the one that propagates —
 * a failed compensation must not mask the failure that triggered it.
 */
async function deleteQuietly(env: CloudflareBindings, key: string): Promise<void> {
  try {
    await env.R2_BUCKET.delete(key);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[portal] R2 compensating delete failed (key=${key}): ${reason}`);
  }
}

/**
 * Bumps the case activity timestamp after a durable upload so the row resurfaces
 * in the reviewer queue. Best-effort: the document is already committed, so a
 * stale `updated_at` is cosmetic and must not fail the request or trigger the R2
 * compensation — hence logged, not rethrown.
 */
async function touchCase(db: Db, caseId: string, organizationId: string): Promise<void> {
  try {
    await db
      .update(cases)
      .set({ updated_at: new Date() })
      .where(and(eq(cases.id, caseId), eq(cases.organization_id, organizationId)));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[portal] case updated_at bump failed (case=${caseId}): ${reason}`);
  }
}

/**
 * Persists one evidence upload as a NEW document version. R2 put first, then an
 * atomic ownership-guarded `documents` insert (`INSERT ... SELECT ... WHERE
 * owner` — no read-then-write TOCTOU); the just-written object is deleted if the
 * insert throws OR matches no owned case, so a partial failure never leaves R2
 * holding an unreferenced object. The R2 key carries a fresh uuid
 * (`<caseId>/<docKind>/<docId>`) so re-uploads never overwrite a prior version.
 * The stored content type is the sniffed type, never the client `file.type`.
 */
export async function storeEvidence(
  env: CloudflareBindings,
  db: Db,
  viewer: ViewerContext,
  caseId: string,
  input: EvidenceObject,
): Promise<string> {
  const docId = crypto.randomUUID();
  const key = documentKey(caseId, input.docKind, docId);
  await env.R2_BUCKET.put(key, await input.file.arrayBuffer(), {
    httpMetadata: { contentType: input.contentType },
  });
  try {
    const inserted = await insertDocumentIfOwned(db, {
      id: docId,
      caseId,
      organizationId: viewer.organizationId,
      ownerUserId: viewer.userId,
      docKind: input.docKind,
      r2Key: key,
      filename: input.filename,
      contentType: input.contentType,
      uploadedAtMs: Date.now(),
    });
    if (!inserted) throw new Error(`evidence upload matched no owned case (${caseId})`);
  } catch (error) {
    await deleteQuietly(env, key);
    throw error;
  }
  await touchCase(db, caseId, viewer.organizationId);
  return key;
}
