/**
 * Dev-only seed for Langfuse model pricing.
 *
 * Reads `docker/langfuse-models.json`, validates via zod, and POSTs each
 * model to the Langfuse models API (`POST /api/public/models`). Idempotent:
 * 409 "already exists" is treated as success.
 *
 * **Security:** asserts `LANGFUSE_HOST` starts with `http://localhost` or
 * `http://127.0.0.1` before any network call — fails loudly if env is
 * misconfigured to point at a cloud/wrong account.
 *
 * Usage: `bun run seed:langfuse`
 */
import { z } from "zod";
import { resolve } from "node:path";

const LangfuseModelSchema = z.object({
  model_name: z.string(),
  match_pattern: z.string(),
  unit: z.literal("TOKENS"),
  input_price: z.number().min(0),
  output_price: z.number().min(0),
  tokenizer_id: z.string(),
});

type LangfuseModel = z.infer<typeof LangfuseModelSchema>;

const EnvSchema = z.object({
  LANGFUSE_HOST: z.string().min(1),
  LANGFUSE_PUBLIC_KEY: z.string().min(1),
  LANGFUSE_SECRET_KEY: z.string().min(1),
});

function assertLocalHost(host: string): void {
  const url = new URL(host);
  const isLocal =
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    (url.protocol === "http:" || url.protocol === "https:");
  if (!isLocal) {
    throw new Error(
      `seed-langfuse: LANGFUSE_HOST must be a localhost URL (got ${host}). Refusing to seed non-local instance.`,
    );
  }
}

async function loadModels(): Promise<LangfuseModel[]> {
  const modelsPath = resolve(import.meta.dir, "../docker/langfuse-models.json");
  const raw = await Bun.file(modelsPath).json();
  const parsed = z.array(LangfuseModelSchema).safeParse(raw);
  if (!parsed.success) {
    throw new Error(`seed-langfuse: invalid docker/langfuse-models.json — ${parsed.error.message}`);
  }
  return parsed.data;
}

interface SeedResult {
  created: number;
  skipped: number;
  failed: number;
}

async function seedModel(
  host: string,
  publicKey: string,
  secretKey: string,
  model: LangfuseModel,
): Promise<"created" | "skipped" | "failed"> {
  const credentials = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const res = await fetch(`${host}/api/public/models`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(model),
  });
  if (res.ok) return "created";
  const body = await res.text();
  if (res.status === 409 || body.toLowerCase().includes("already exists")) return "skipped";
  console.error(`  ✗ ${model.model_name}: ${res.status} — ${body}`);
  return "failed";
}

async function main(): Promise<void> {
  const env = EnvSchema.parse(process.env);
  assertLocalHost(env.LANGFUSE_HOST);

  const models = await loadModels();
  console.log(`seed-langfuse: ${models.length} models loaded from docker/langfuse-models.json`);

  const result: SeedResult = { created: 0, skipped: 0, failed: 0 };
  for (const model of models) {
    const status = await seedModel(
      env.LANGFUSE_HOST,
      env.LANGFUSE_PUBLIC_KEY,
      env.LANGFUSE_SECRET_KEY,
      model,
    );
    result[status]++;
    const icon = status === "created" ? "✓" : status === "skipped" ? "○" : "✗";
    console.log(`  ${icon} ${model.model_name} (${status})`);
  }

  console.log(
    `\nseed-langfuse: done — created: ${result.created}, skipped: ${result.skipped}, failed: ${result.failed}`,
  );
  if (result.failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(`seed-langfuse: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
