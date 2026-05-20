import { Hono } from "hono";
import type { CloudflareBindings } from "./env.ts";

const BINDING_NAMES = ["DB", "R2_BUCKET", "VECTORIZE", "KV", "BRIEF_QUEUE", "ASSETS"] as const;

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    bindings: BINDING_NAMES,
    runtime: "cloudflare-workers",
  }),
);

export type AppType = typeof app;
export default app;
