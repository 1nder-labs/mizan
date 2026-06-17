#!/usr/bin/env bun
/**
 * Uploads PNG document fixtures to local R2 via wrangler.
 * Idempotent: re-upload overwrites the same key.
 */

import { allFixtureKeys, fixturePath, materializeLocalFixtures } from "./seed-helpers.ts";

async function uploadKey(key: string, filePath: string): Promise<void> {
  const proc = Bun.spawn(
    [
      "bunx",
      "wrangler",
      "r2",
      "object",
      "put",
      `mizan-uploads/${key}`,
      "--file",
      filePath,
      "--content-type",
      "application/pdf",
      "--local",
    ],
    { cwd: "apps/worker", stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`R2 upload failed for ${key} (exit ${exitCode}): ${err}`);
  }
  console.log(`uploaded R2 key ${key}`);
}

await materializeLocalFixtures();
const keys = await allFixtureKeys();

for (const key of keys) {
  await uploadKey(key, fixturePath(key));
}
