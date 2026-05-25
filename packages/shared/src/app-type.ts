/**
 * Re-exports `AppType` from the worker entry so every consumer that
 * needs end-to-end-typed Hono RPC can import from a single shared
 * package rather than creating direct cross-app references.
 *
 * Type-only; zero runtime bytes cross the module boundary.
 */
export type { AppType } from "@mizan/worker/index";
