import { z } from "zod";
import { ImageAuthenticitySchema } from "@mizan/shared";

/**
 * Category document extraction — tagged-variant union wrapped in an
 * object root.
 *
 * Cross-provider strict-mode constraints:
 *   - Top level must be `type: "object"` (OpenAI Responses /
 *     ChatCompletions strict mode + Anthropic tool-input strict mode
 *     both reject top-level `anyOf` / `oneOf`).
 *   - Inside an object property, `anyOf` of object variants IS
 *     accepted by both providers — each variant declares its own
 *     `additionalProperties: false`, every property listed in
 *     `required`, and a literal discriminator (`doc_kind`).
 *
 * `z.union(...)` emits `anyOf` (not `oneOf`), so it is the cross-
 * provider-compatible discriminator. Each variant keeps its own
 * required fields — no fake fields, no nullable noise. Downstream
 * narrowing happens on the `doc_kind` literal as before.
 */

const MedicalVariant = z
  .object({
    doc_kind: z.literal("medical"),
    patient_name: z.string(),
    provider_name: z.string(),
    treatment_summary: z.string(),
    amount_claimed: z.string(),
    confidence: z.number().finite(),
  })
  .strict();

const SchoolVariant = z
  .object({
    doc_kind: z.literal("school"),
    student_name: z.string(),
    institution_name: z.string(),
    tuition_summary: z.string(),
    amount_claimed: z.string(),
    confidence: z.number().finite(),
  })
  .strict();

const OrgRegistrationVariant = z
  .object({
    doc_kind: z.literal("org_registration"),
    org_name: z.string(),
    registration_number: z.string(),
    jurisdiction: z.string(),
    tax_exempt_status: z.string().nullable(),
    confidence: z.number().finite(),
  })
  .strict();

export const CategoryDocVariantSchema = z.union([
  MedicalVariant,
  SchoolVariant,
  OrgRegistrationVariant,
]);

/**
 * LLM-output root schema. The variant lives under `doc` so the top
 * level stays a single object — required for cross-provider strict
 * mode. Consumers access `extract.doc.doc_kind` for narrowing.
 */
export const CategoryDocsSchema = z
  .object({
    doc: CategoryDocVariantSchema,
    /**
     * Image-authenticity read of the category-document image, produced by the
     * same vision call that extracts `doc`. A sibling root property keeps the
     * top level a single object (cross-provider strict mode).
     */
    image_authenticity: ImageAuthenticitySchema,
  })
  .strict();
