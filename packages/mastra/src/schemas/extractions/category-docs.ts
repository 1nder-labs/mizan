import { z } from "zod";

export const MedicalDocsSchema = z.object({
  doc_kind: z.literal("medical"),
  patient_name: z.string(),
  provider_name: z.string(),
  treatment_summary: z.string(),
  amount_claimed: z.string(),
  confidence: z.number(),
});

export const SchoolDocsSchema = z.object({
  doc_kind: z.literal("school"),
  student_name: z.string(),
  institution_name: z.string(),
  tuition_summary: z.string(),
  amount_claimed: z.string(),
  confidence: z.number(),
});

export const OrgRegistrationSchema = z.object({
  doc_kind: z.literal("org_registration"),
  org_name: z.string(),
  registration_number: z.string(),
  jurisdiction: z.string(),
  tax_exempt_status: z.string().nullable(),
  confidence: z.number(),
});

export const CategoryDocsSchema = z.discriminatedUnion("doc_kind", [
  MedicalDocsSchema,
  SchoolDocsSchema,
  OrgRegistrationSchema,
]);
