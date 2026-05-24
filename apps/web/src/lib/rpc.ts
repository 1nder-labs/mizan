/**
 * Hono RPC client for the worker's `/api` sub-app.
 *
 * Base URL `/api` aligns request URLs cleanly:
 * `api.cases.$get(...)` → `GET /api/cases`. The Vite dev proxy
 * forwards `/api` to wrangler at 8787 (see vite.config.ts).
 *
 * A worker route response change breaks every consumer at compile time
 * because both sides share `AppType` (PRD acceptance #2).
 */
import { hc } from "hono/client";
import type { AppType } from "@mizan/worker/index";

const BASE_URL = "/api";

export const api = hc<AppType>(BASE_URL);
