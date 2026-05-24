import { z } from "zod";

/**
 * Reviewer login form contract. Mirrors better-auth's `emailAndPassword`
 * `minPasswordLength: 12` so the client rejects weak inputs before the
 * server hit. Worker auth config is at `apps/worker/src/auth/index.ts`.
 */
export const LoginSchema = z
  .object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(12, "Must be at least 12 characters"),
  })
  .strict();

export type LoginInput = z.infer<typeof LoginSchema>;
