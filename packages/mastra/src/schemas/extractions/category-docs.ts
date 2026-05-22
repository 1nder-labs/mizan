import { z } from "zod";

/*
 * `CategoryDocsSchema` is consumed by `extractCategoryDocs.extract` as a
 * `generateObject` schema, so the encoding uses `z.union` (emits `anyOf`)
 * rather than `z.discriminatedUnion` (emits `oneOf`, which OpenAI strict
 * mode rejects). TypeScript narrowing on the `doc_kind` literal still
 * works at call sites because every variant declares `doc_kind` as a
 * `z.literal()`.
 */

export const MedicalDocsSchema = z
  .object({
    doc_kind: z.literal("medical"),
    patient_name: z.string(),
    provider_name: z.string(),
    treatment_summary: z.string(),
    amount_claimed: z.string(),
    confidence: z.number(),
  })
  .strict();

export const SchoolDocsSchema = z
  .object({
    doc_kind: z.literal("school"),
    student_name: z.string(),
    institution_name: z.string(),
    tuition_summary: z.string(),
    amount_claimed: z.string(),
    confidence: z.number(),
  })
  .strict();

export const OrgRegistrationSchema = z
  .object({
    doc_kind: z.literal("org_registration"),
    org_name: z.string(),
    registration_number: z.string(),
    jurisdiction: z.string(),
    tax_exempt_status: z.string().nullable(),
    confidence: z.number(),
  })
  .strict();

export const CategoryDocsSchema = z.union([
  MedicalDocsSchema,
  SchoolDocsSchema,
  OrgRegistrationSchema,
]);
