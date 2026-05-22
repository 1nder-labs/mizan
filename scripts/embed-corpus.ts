#!/usr/bin/env bun
/**
 * Populates the remote `mizan-policy-corpus` Vectorize index from committed JSON corpora.
 *
 * Usage:
 *   bun run embed-corpus
 *   bun run embed-corpus -- --dry-run
 *   bun run embed-corpus -- --source=zakat
 */

import { computeCorpusVectors } from "./lib/embed-corpus-into.ts";

const INDEX_NAME = "mizan-policy-corpus";

interface CliOptions {
  readonly dryRun: boolean;
  readonly source?: "zakat" | "safety";
}

function parseCli(argv: string[]): CliOptions {
  let dryRun = false;
  let source: "zakat" | "safety" | undefined;
  for (const arg of argv) {
    if (arg === "--help") {
      console.log("Usage: bun run embed-corpus [--dry-run] [--source=zakat|safety]");
      process.exit(0);
    }
    if (arg === "--dry-run") dryRun = true;
    if (arg.startsWith("--source=")) {
      const value = arg.slice("--source=".length);
      if (value !== "zakat" && value !== "safety") {
        throw new Error(`invalid --source value: ${value}`);
      }
      source = value;
    }
  }
  return { dryRun, source };
}

function requireRealEmbedEnvironment(dryRun: boolean): void {
  if (dryRun) return;
  const mockTriggers = ["MOCK_LLM_RESPONSES", "MOCK_EMBEDDINGS"] as const;
  for (const key of mockTriggers) {
    if (process.env[key]) {
      throw new Error(
        `${key} is set — refusing to upload deterministic pseudo-vectors to the live Vectorize index. ` +
          `Unset ${key}, or re-run with --dry-run to preview vectors without uploading.`,
      );
    }
  }
  if (!process.env["OPENAI_API_KEY"]) {
    throw new Error(
      "OPENAI_API_KEY is required — set it in the environment or apps/worker/.dev.vars",
    );
  }
}

async function writeNdjson(
  path: string,
  vectors: Awaited<ReturnType<typeof computeCorpusVectors>>,
): Promise<void> {
  const lines = vectors.map((vector) => JSON.stringify(vector));
  await Bun.write(path, `${lines.join("\n")}\n`);
}

async function upsertViaWrangler(ndjsonPath: string): Promise<void> {
  const proc = Bun.spawn(
    ["bunx", "wrangler", "vectorize", "upsert", INDEX_NAME, "--file", ndjsonPath],
    {
      cwd: "apps/worker",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) {
    throw new Error(`wrangler vectorize upsert failed (${exitCode}): ${stderr || stdout}`);
  }
  if (stdout.trim().length > 0) console.log(stdout.trim());
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  requireRealEmbedEnvironment(options.dryRun);
  const env = {
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
    MOCK_LLM_RESPONSES: process.env["MOCK_LLM_RESPONSES"],
  };
  const vectors = await computeCorpusVectors(options, env);
  if (options.dryRun) {
    console.log(`dry-run: ${vectors.length} vectors`);
    vectors.slice(0, 3).forEach((vector) => {
      console.log(`${vector.id} dim=${vector.values.length}`);
    });
    return;
  }
  const ndjsonPath = `/tmp/mizan-corpus-vectors-${Date.now()}.ndjson`;
  await writeNdjson(ndjsonPath, vectors);
  try {
    await upsertViaWrangler(ndjsonPath);
  } finally {
    await Bun.file(ndjsonPath).delete();
  }
  console.log(`Upserted ${vectors.length} vectors`);
}

await main();
