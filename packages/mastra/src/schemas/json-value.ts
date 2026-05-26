import { z } from "zod";

/** JSON-serializable scalar. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON-serializable value without `unknown`. */
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
