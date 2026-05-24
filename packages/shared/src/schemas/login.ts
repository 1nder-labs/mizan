import { z } from "zod";

/**
 * Reviewer login form contract. Mirrors better-auth's `signIn.email`
 * preconditions plus a tighter 8-char minimum so the client rejects
 * obviously-weak inputs before the server hit.
 */
export const LoginSchema = z
  .object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Must be at least 8 characters"),
  })
  .strict();

export type LoginInput = z.infer<typeof LoginSchema>;
