/**
 * Centralized reads/writes for the append-only `documents` table — the single
 * source of truth for uploaded evidence. "Current version" of a slot is the row
 * with the greatest `uploaded_at`; history is every other row for that slot.
 * Every consumer (Mastra case-loader, reviewer doc URLs, client evidence list,
 * draft sweep) goes through here so the version semantics live in one place.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { cases } from "./schema.ts";
import {
  documents,
  EXTRACTED_DOCUMENT_KINDS,
  type DocumentKindValue,
  type ExtractedDocumentKind,
} from "./documents.schema.ts";
import type { Db } from "./index.ts";

export interface DocumentRow {
  readonly id: string;
  readonly doc_kind: DocumentKindValue;
  readonly r2_key: string;
  readonly filename: string;
  readonly content_type: string;
  readonly uploaded_at: Date;
}

/** Current R2 key per extraction slot ("" when the slot has no upload yet). */
export type ExtractedDocumentKeys = Record<ExtractedDocumentKind, string>;

const DOC_COLUMNS = {
  id: documents.id,
  doc_kind: documents.doc_kind,
  r2_key: documents.r2_key,
  filename: documents.filename,
  content_type: documents.content_type,
  uploaded_at: documents.uploaded_at,
};

/** Every document for a case, newest upload first. */
export async function listCaseDocuments(
  db: Db,
  caseId: string,
  organizationId: string,
): Promise<DocumentRow[]> {
  return db
    .select(DOC_COLUMNS)
    .from(documents)
    .where(and(eq(documents.case_id, caseId), eq(documents.organization_id, organizationId)))
    .orderBy(desc(documents.uploaded_at))
    .all();
}

/** Epoch-ms of the most recent document upload/replace for a case, or null when none. */
export async function latestDocumentUploadMs(
  db: Db,
  caseId: string,
  organizationId: string,
): Promise<number | null> {
  const row = await db
    .select({ max: sql<number | null>`MAX(${documents.uploaded_at})` })
    .from(documents)
    .where(and(eq(documents.case_id, caseId), eq(documents.organization_id, organizationId)))
    .get();
  return row?.max ?? null;
}

/** Latest R2 key for each of the three extraction slots; "" for an empty slot. */
export async function currentExtractedKeys(
  db: Db,
  caseId: string,
  organizationId: string,
): Promise<ExtractedDocumentKeys> {
  const rows = await db
    .select({ doc_kind: documents.doc_kind, r2_key: documents.r2_key })
    .from(documents)
    .where(
      and(
        eq(documents.case_id, caseId),
        eq(documents.organization_id, organizationId),
        inArray(documents.doc_kind, [...EXTRACTED_DOCUMENT_KINDS]),
      ),
    )
    .orderBy(desc(documents.uploaded_at))
    .all();
  const latest = new Map<string, string>();
  for (const row of rows) if (!latest.has(row.doc_kind)) latest.set(row.doc_kind, row.r2_key);
  return {
    creator_id: latest.get("creator_id") ?? "",
    bank_statement: latest.get("bank_statement") ?? "",
    category_doc: latest.get("category_doc") ?? "",
  };
}

/** Current (latest) document for one extraction slot, or null when unset. */
export async function currentExtractedDocument(
  db: Db,
  caseId: string,
  organizationId: string,
  docKind: ExtractedDocumentKind,
): Promise<DocumentRow | null> {
  const row = await db
    .select(DOC_COLUMNS)
    .from(documents)
    .where(
      and(
        eq(documents.case_id, caseId),
        eq(documents.organization_id, organizationId),
        eq(documents.doc_kind, docKind),
      ),
    )
    .orderBy(desc(documents.uploaded_at))
    .limit(1)
    .get();
  return row ?? null;
}

/** Resolves one document by id, scoped to its case + org (null when not found). */
export async function documentById(
  db: Db,
  caseId: string,
  organizationId: string,
  docId: string,
): Promise<DocumentRow | null> {
  const row = await db
    .select(DOC_COLUMNS)
    .from(documents)
    .where(
      and(
        eq(documents.id, docId),
        eq(documents.case_id, caseId),
        eq(documents.organization_id, organizationId),
      ),
    )
    .get();
  return row ?? null;
}

export interface InsertDocumentInput {
  readonly id: string;
  readonly caseId: string;
  readonly organizationId: string;
  readonly ownerUserId: string;
  readonly docKind: DocumentKindValue;
  readonly r2Key: string;
  readonly filename: string;
  readonly contentType: string;
  readonly uploadedAtMs: number;
}

/**
 * Appends one evidence row (a new version or a supplementary doc) ONLY when the
 * target case is owned by `ownerUserId` within `organizationId`. Ownership check
 * and insert are a single atomic `INSERT ... SELECT ... WHERE` — no read-then-
 * write TOCTOU window — and `case_id`/`organization_id` are taken from the
 * matched case row so they can never drift from a forged input. Returns `true`
 * when a row was written, `false` when no owned case matched.
 */
export async function insertDocumentIfOwned(db: Db, input: InsertDocumentInput): Promise<boolean> {
  const result = await db.run(sql`
    INSERT INTO ${documents} (id, case_id, doc_kind, r2_key, filename, content_type, uploaded_at, organization_id)
    SELECT ${input.id}, ${cases.id}, ${input.docKind}, ${input.r2Key}, ${input.filename}, ${input.contentType}, ${input.uploadedAtMs}, ${cases.organization_id}
    FROM ${cases}
    WHERE ${cases.id} = ${input.caseId}
      AND ${cases.created_by} = ${input.ownerUserId}
      AND ${cases.organization_id} = ${input.organizationId}
  `);
  return (result.meta?.changes ?? 0) > 0;
}
