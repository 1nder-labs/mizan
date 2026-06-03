import { and, cases, eq, sql, type Db } from "@mizan/db";
import type { DocumentKey, ViewerContext } from "@mizan/shared";
import type { CloudflareBindings } from "../../env.ts";
import { evidenceKey } from "./evidence-upload.ts";

export interface EvidenceObject {
  readonly file: File;
  readonly docKind: DocumentKey;
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
 * Persists one evidence object: R2 put first, then the overlay key. The update
 * is scoped to the owning client AND org, returns the affected rows, and
 * deletes the just-written object if the update throws OR matches no row (case
 * vanished mid-upload) — so a partial failure never leaves R2 holding an object
 * the case can't reference. The key is deterministic (`<caseId>/<docKind>`) so a
 * retry overwrites, never duplicates. The stored content type is the sniffed
 * type from `readEvidenceInput`, never the client-reported `file.type`.
 */
export async function storeEvidence(
  env: CloudflareBindings,
  db: Db,
  viewer: ViewerContext,
  caseId: string,
  input: EvidenceObject,
): Promise<string> {
  const key = evidenceKey(caseId, input.docKind);
  await env.R2_BUCKET.put(key, await input.file.arrayBuffer(), {
    httpMetadata: { contentType: input.contentType },
  });
  try {
    const updated = await db
      .update(cases)
      .set({
        brief_partial_json: sql`json_set(${cases.brief_partial_json}, ${`$.r2_keys.${input.docKind}`}, ${key})`,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(cases.id, caseId),
          eq(cases.created_by, viewer.userId),
          eq(cases.organization_id, viewer.organizationId),
        ),
      )
      .returning({ id: cases.id });
    if (updated.length === 0) {
      throw new Error(`evidence overlay update matched no owned case (${caseId})`);
    }
  } catch (error) {
    await deleteQuietly(env, key);
    throw error;
  }
  return key;
}
