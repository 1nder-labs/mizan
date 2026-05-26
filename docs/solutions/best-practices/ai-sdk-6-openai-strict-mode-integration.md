---
title: AI SDK 6 + OpenAI Strict Mode + Mastra — integration best practices
date: 2026-05-24
category: best-practices
module: brief_system
problem_type: best_practice
component: brief_system
severity: high
applies_when:
  - "Calling AI SDK 6 `generateText` with `Output.object` from inside a Mastra workflow step"
  - "Using OpenAI structured output via the Responses API"
  - "Sending multimodal images to the LLM"
  - "Schemas use top-level `z.union` or `z.discriminatedUnion`"
  - "Test fixtures rely on minimal / placeholder images"
tags:
  - ai-sdk-6
  - openai
  - mastra
  - structured-output
  - vision
  - schema-design
  - prompt-engineering
---

# AI SDK 6 + OpenAI Strict Mode + Mastra — integration best practices

## Context

Phase 4 of the Mizan brief workflow went from passing unit-test suites to running end-to-end against real OpenAI (`gpt-5.4-mini-2026-03-17`) in `wrangler dev` with a remote Vectorize index. Eight distinct integration issues surfaced between the AI SDK 6 OpenAI provider, the Mastra workflow runtime, the OpenAI Responses API strict-mode contract, and the test-fixture pipeline. Each failure mode is small in isolation but they compound — most blocked the workflow at the very first extractor call, so the rest of the pipeline was untested until each was resolved.

This doc captures the eight patterns so the next workflow that needs LLM + structured output + multimodal in this stack does not re-derive them.

## Guidance

### 1. Cross-provider strict mode requires `type: "object"` at the root

OpenAI Responses API + Anthropic strict mode (2026-04-30) both reject top-level `anyOf` / `oneOf`. A bare `z.union(...)` of tagged variants serialises to `{ "anyOf": [...] }` at the root and fails with:

```
Invalid schema for response_format: schema must be a JSON Schema of 'type: "object"', got 'type: "None"'.
```

**Best practice:** wrap variant unions in an envelope object and unwrap in `postProcess`.

```ts
// Wire-shape: { chain: <variant> }
export const VouchingChainEnvelopeSchema = z
  .object({ chain: z.union([NoneVariant, ...]) })
  .strict();

// Persisted-shape: the variant directly
export const VouchingChainVariantSchema = z.union([NoneVariant, ...]);
```

```ts
postProcess: ({ raw }) => assertVouchingChain(raw.chain),
```

### 2. `withMastra()` is OPTIONAL — don't use it without a reason

Per Mastra docs: `withMastra(model, opts)` adds input/output processors and memory persistence. We use neither at extractor / signal / compose call sites — so use the bare AI SDK model. The current `@mastra/ai-sdk` wrapper also mangles AI SDK 6 image content parts before they reach OpenAI's Responses API ("image data not valid" on every multimodal call). Telemetry rides on `experimental_telemetry` on each `generateText`, not on the model wrapper.

```ts
const config = args.override ?? getDefaultModel(args.env, args.kind);
const raw = getModel(config, args.env);
return { model: raw, config };
```

### 3. OpenAI Responses API wants the full data URL in `image_url`

AI SDK 6 docs say `ImagePart.image` accepts `Uint8Array | base64 string | data URL | URL`. In practice, the OpenAI Responses-API code path:

- rejects raw `Uint8Array` with "invalid base64-encoded value"
- rejects bare base64 strings with the same message
- accepts the full `data:<mediaType>;base64,<payload>` URL

Build the data URL ourselves at the message-construction boundary in one place:

```ts
function bytesToDataUrl(bytes: Uint8Array, mediaType: string): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}
```

### 4. Sniff image magic bytes — R2 extensions are conventional, not enforced

A `.png` key in R2 may legitimately hold JPEG, WebP, or GIF if upstream saved with the wrong extension. Sending bytes with the wrong `mediaType` triggers a provider-side parse failure that looks like an SDK bug.

```ts
const SIGNATURES = [
  { mediaType: "image/png", header: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mediaType: "image/jpeg", header: [0xff, 0xd8, 0xff] },
  // ...
];

export function detectImageMediaType(bytes: Uint8Array): string | null {
  /* ... */
}
```

Pair the detected `mediaType` with the raw bytes when building the data URL.

### 5. Don't ask LLMs to enforce character thresholds — gate the call app-side

LLMs hallucinate token-level counts. Prompts like _"emit `structure: \"none\"` when `vouching_narrative` is shorter than 20 characters"_ fail unpredictably — the model picks an institutional variant on an empty narrative and the app-side guard then throws.

**Best practice:** make the gate the application's job. The LLM is never asked to count.

```ts
const MIN_VOUCHING_NARRATIVE_CHARS = 20;

async function classifyOrDefault(args): Promise<VouchingChain> {
  const narrative = (args.caseRow.vouching_narrative ?? "").trim();
  if (narrative.length < MIN_VOUCHING_NARRATIVE_CHARS) {
    return {
      structure: "none",
      weakest_link_narrative:
        "no vouching narrative provided — defaulted to `none` by app-side gate",
    };
  }
  // ...call LLM only when narrative is sufficient
}
```

### 6. Cross-provider strict-mode schema checklist

For every Zod schema sent to an LLM as structured output, apply all of:

| Rule                                       | Why                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `.strict()` on every object                | Emits `additionalProperties: false` (OpenAI strict requires it)                                 |
| All properties in `required`               | OpenAI strict rejects missing keys                                                              |
| `.nullable()` for omittable fields         | Lets the LLM emit `null` instead of omitting                                                    |
| `.finite()` on every numeric field         | Rejects NaN / ±Infinity at parse                                                                |
| No `.min()` / `.max()` keywords on strings | Anthropic strict rejects `minLength` / `maxLength`                                              |
| No `.url()` format                         | OpenAI strict accepts only `date-time, time, date, duration, email, hostname, ipv4, ipv6, uuid` |
| Wrap variant unions in an object           | See pattern 1                                                                                   |

Use `.describe()` to express character bounds in the prompt instead of `.max()` keywords. Enforce via `.refine()` for runtime checks that don't leak into JSON Schema.

### 7. Vision models reject 1×1 placeholder PNGs

OpenAI vision (gpt-5.4 family) rejects 1×1 placeholder PNGs as `image_parse_error: "unsupported image"`. Test fixtures need real-sized images — `≥256×256` is safe. For dev seeding, fetch from `picsum.photos` on demand and cache to disk:

```ts
async function materializeLocalFixtures(): Promise<void> {
  const keys = await allFixtureKeys();
  for (const key of keys) {
    const target = fixturePath(key);
    if (existsSync(target)) continue;
    const res = await fetch(`https://picsum.photos/600/400`, { redirect: "follow" });
    if (!res.ok) throw new Error(`fixture fetch failed (${res.status}) for ${key}`);
    await Bun.write(target, new Uint8Array(await res.arrayBuffer()));
  }
}
```

Integration tests that mock the LLM can still use 1×1 PNGs (the bytes never reach a vision model).

### 8. Sanitise schema names — OpenAI requires `^[a-zA-Z0-9_-]+$`

Internal `schemaName` conventions like `extractCreatorIdDoc.extract` (dot-namespaced) are great for mock-response keying and telemetry but fail the OpenAI Responses-API regex with:

```
Invalid 'text.format.name': string does not match pattern. Expected '^[a-zA-Z0-9_-]+$'
```

Sanitise at the provider boundary so internal keys stay stable:

```ts
function sanitizeSchemaName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

output: Output.object({ schema, name: sanitizeSchemaName(invocation.schemaName) }),
```

## Why This Matters

Each of these eight patterns surfaced as a workflow-blocking failure during the first real-OpenAI E2E run. They are individually small but compound — most prevented the very first extractor step from running, so every downstream step (extractor parallel block, vouching classifier, compose, gate, draft, persist) stayed unverified until each one was unblocked.

Documenting them together means the next workflow that needs `AI SDK 6 + OpenAI structured output + Mastra step + multimodal images + variant schemas` does not waste a 10-pass debugging arc rediscovering them.

## When to Apply

- Adding a new LLM-emitting Mastra step (extractor, signal classifier, compose, draft)
- Writing a new Zod schema for an LLM structured output target
- Adding a vision-model call in the workflow
- Swapping LLM provider (OpenAI ↔ Anthropic) — pattern 6 in particular
- Seeding new R2 fixtures or integration-test placeholders
- Debugging a "schema must be of type object" / "image data not valid" / "invalid base64-encoded value" error from any provider

## Examples

The Phase 4 workflow now passes end-to-end against real OpenAI:

| Case | Geography          | Path                   | Result                          |
| ---- | ------------------ | ---------------------- | ------------------------------- |
| 001  | US (SAFE)          | documentary            | READY_FOR_REVIEW + REQUEST_DOCS |
| 006  | YE (OFAC_ADJACENT) | community_vouching     | READY_FOR_REVIEW + ESCALATE     |
| 007  | SD (OFAC)          | institutional_vouching | READY_FOR_REVIEW + ESCALATE     |
| 008  | PS (OFAC_ADJACENT) | none                   | READY_FOR_REVIEW + ESCALATE     |

Each case exercises the full 14-step workflow with real `gpt-5.4-mini-2026-03-17` calls, real `text-embedding-3-small` embeddings against the remote Vectorize index, real D1 persistence, real R2 reads, and the forced-escalate gate at end. Truth-table matches `packages/mastra/src/steps/forcedEscalateGate/predicate.ts`.

## Related Files

- `packages/mastra/src/util/image-format.ts` — magic-byte sniff + data URL builder
- `packages/mastra/src/steps/shared/runStructuredLlm.ts` — central LLM call with `sanitizeSchemaName`
- `packages/mastra/src/steps/classifyVouchingChain/index.ts` — app-side gate pattern + envelope unwrap
- `packages/mastra/src/schemas/extractions/category-docs.ts` — envelope-wrapped tagged union
- `packages/shared/src/schemas/vouching.ts` — envelope-wrapped tagged union (signal payload)
- `packages/mastra/src/runtime/model-resolver.ts` — bare `openai(model)`, no `withMastra` wrap
- `scripts/seed-helpers.ts` — picsum fixture cache
