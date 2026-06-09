/**
 * The append-only `documents` table — the single source of truth for uploaded
 * evidence. Registered in `drizzle.config.ts`'s schema array and merged into the
 * runtime client in `index.ts`, so it participates in migrations + queries
 * identically to the core tables.
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organizations } from "./auth.schema.ts";
import { cases } from "./schema.ts";

export const EXTRACTED_DOCUMENT_KINDS = ["creator_id", "bank_statement", "category_doc"] as const;

/** Client-attached evidence beyond the three required slots (invoices, EOBs, bills). */
export const SUPPLEMENTARY_DOC_KIND = "supplementary" as const;

export const DOCUMENT_KIND_VALUES = [...EXTRACTED_DOCUMENT_KINDS, SUPPLEMENTARY_DOC_KIND] as const;

export type ExtractedDocumentKind = (typeof EXTRACTED_DOCUMENT_KINDS)[number];

export type DocumentKindValue = (typeof DOCUMENT_KIND_VALUES)[number];

/**
 * Re-uploading a slot inserts a NEW row (prior versions are retained, not
 * overwritten); the CURRENT version of a slot is the row with the greatest
 * `uploaded_at` for that `(case_id, doc_kind)`. The three extraction slots feed
 * the workflow via `case-loader`, which reads the current key per slot here;
 * `supplementary` rows are read by `extractSupplementaryDocs`, which summarizes
 * them into the brief so client-attached evidence is never seen as missing.
 * `r2_key` is unique per upload (`<caseId>/<doc_kind>/<uuid>`) so versions never
 * collide in R2.
 */
export const documents = sqliteTable(
  "documents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    case_id: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    doc_kind: text("doc_kind", { enum: DOCUMENT_KIND_VALUES }).notNull(),
    r2_key: text("r2_key").notNull(),
    filename: text("filename").notNull().default(""),
    content_type: text("content_type").notNull(),
    uploaded_at: integer("uploaded_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("documents_org_case_idx").on(table.organization_id, table.case_id),
    index("documents_case_kind_uploaded_idx").on(table.case_id, table.doc_kind, table.uploaded_at),
  ],
);
