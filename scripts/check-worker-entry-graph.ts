#!/usr/bin/env bun
/**
 * CI gate: the worker's STATIC import graph must stay free of the heavy
 * Mastra / AI-SDK modules.
 *
 * Every workerd boot — production cold start AND each integration-test file —
 * evaluates the worker entry's full static module graph. The Mastra + AI-SDK
 * graph costs ~30s of module evaluation, which is why the heavy surface is
 * reached only via dynamic `import()` inside handlers (brief stream, chat,
 * queue consumer) and the light helpers live on `@mizan/mastra/runtime`.
 *
 * This script BFS-walks static `import`/`export ... from` edges from the worker
 * entry (following workspace packages, including the light runtime subpath so a
 * heavy leak INSIDE it is caught transitively) and fails when any path reaches a
 * forbidden specifier. Dynamic `import()` edges are intentionally not followed —
 * deferring them is the point.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ENTRY = resolve(ROOT, "apps/worker/src/index.ts");

const WORKSPACE: ReadonlyArray<readonly [string, string]> = [
  ["@mizan/mastra/runtime", "packages/mastra/src/runtime.ts"],
  ["@mizan/mastra/testing", "packages/mastra/src/testing.ts"],
  ["@mizan/mastra", "packages/mastra/src/index.ts"],
  ["@mizan/db", "packages/db/src/index.ts"],
  ["@mizan/shared", "packages/shared/src/index.ts"],
  ["@mizan/eval", "packages/eval/src/index.ts"],
];

const FORBIDDEN: readonly RegExp[] = [
  /^@mastra\//,
  /^@ai-sdk\//,
  /^ai$/,
  /^@mizan\/mastra$/,
  /^@mizan\/mastra\/testing$/,
];

/** Static import/re-export specifiers in a module (type-only edges excluded). */
function staticSpecifiers(source: string): string[] {
  const out: string[] = [];
  const fromEdges = source.matchAll(
    /(?:^|\n)\s*(import|export)\s+([\s\S]*?)\bfrom\s*["']([^"']+)["']/g,
  );
  for (const match of fromEdges) {
    const clause = match[2] ?? "";
    const spec = match[3] ?? "";
    if (/^type[\s{]/.test(clause.trim())) continue;
    out.push(spec);
  }
  const sideEffectEdges = source.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g);
  for (const match of sideEffectEdges) {
    const spec = match[1];
    if (spec) out.push(spec);
  }
  return out;
}

function resolveSpecifier(spec: string, fromFile: string): string | null {
  if (spec.startsWith(".")) {
    if (/\.(json|wasm|txt|md|html)$/.test(spec)) return null;
    const base = resolve(dirname(fromFile), spec);
    for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
      if (candidate.endsWith(".ts") && existsSync(candidate)) return candidate;
    }
    throw new Error(`unresolvable relative import "${spec}" from ${fromFile}`);
  }
  for (const [pkg, target] of WORKSPACE) {
    if (spec === pkg) return resolve(ROOT, target);
  }
  return null;
}

function walk(): { violations: string[] } {
  const queue: string[] = [ENTRY];
  const parent = new Map<string, string>();
  const seen = new Set<string>(queue);
  const violations: string[] = [];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file) break;
    const source = readFileSync(file, "utf8");
    for (const spec of staticSpecifiers(source)) {
      if (FORBIDDEN.some((re) => re.test(spec))) {
        const chain: string[] = [file];
        let cursor = file;
        while (parent.has(cursor)) {
          const up = parent.get(cursor);
          if (!up) break;
          chain.unshift(up);
          cursor = up;
        }
        violations.push(`${chain.map((f) => f.replace(`${ROOT}/`, "")).join(" → ")} → "${spec}"`);
        continue;
      }
      const resolved = resolveSpecifier(spec, file);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        parent.set(resolved, file);
        queue.push(resolved);
      }
    }
  }
  return { violations };
}

const { violations } = walk();
if (violations.length > 0) {
  console.error("worker entry static graph reaches heavy modules:\n");
  for (const violation of violations) console.error(`  ${violation}\n`);
  console.error(
    "Move the import behind a dynamic import() in the handler, or use @mizan/mastra/runtime for light helpers.",
  );
  process.exit(1);
}
console.log("worker entry static graph: clean (no @mastra/core, @ai-sdk, ai, or mastra barrel)");
