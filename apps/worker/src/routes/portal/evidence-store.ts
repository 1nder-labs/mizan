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
 * Persists one evidence object: R2 put first, then the overlay key. A failed
 * overlay update deletes the just-written object so a partial failure never
 * leaves R2 holding an object the case can't reference. The key is
 * deterministic (`<caseId>/<docKind>`) so a retry overwrites, never duplicates.
 * The stored content type is the sniffed type from `readEvidenceInput`, never
 * the client-reported `file.type`.
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
    await db
      .update(cases)
      .set({
        brief_partial_json: sql`json_set(${cases.brief_partial_json}, ${`$.r2_keys.${input.docKind}`}, ${key})`,
        updated_at: new Date(),
      })
      .where(and(eq(cases.id, caseId), eq(cases.created_by, viewer.userId)));
  } catch (error) {
    await env.R2_BUCKET.delete(key);
    throw error;
  }
  return key;
}
