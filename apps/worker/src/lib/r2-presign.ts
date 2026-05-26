/**
 * R2 presigned-URL signing helper. Produces a short-lived URL the
 * browser fetches directly — the Worker stays out of the doc-bytes
 * path entirely (no CPU on multi-MB PDFs, no edge bandwidth).
 *
 * Pure module: no Hono coupling, no env coupling, no top-level state.
 * Inputs validated with zod at the boundary; on success the function
 * uses typed values throughout. Defensive prefix check rejects object
 * keys outside the seed-overlay shape (`creators/...`, `bank-
 * statements/...`, `category-docs/...`) so even a buggy caller cannot
 * sign arbitrary R2 paths.
 *
 * TTL clamp: 60–3600 seconds. Production callers pass 300; the bounds
 * exist so ops can tweak via env without a code change.
 *
 * R2 endpoint format per Cloudflare docs:
 *   https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<BUCKET>/<KEY>
 */
import { AwsClient } from "aws4fetch";
import { z } from "zod";

const ALLOWED_OBJECT_KEY_PREFIXES = ["creators/", "bank-statements/", "category-docs/"] as const;

const SignR2GetUrlInputSchema = z
  .object({
    accountId: z.string().min(1),
    bucket: z.string().min(1),
    objectKey: z
      .string()
      .min(1)
      .refine(
        (key) => ALLOWED_OBJECT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
        {
          message: `objectKey must start with one of ${ALLOWED_OBJECT_KEY_PREFIXES.join(", ")}`,
        },
      ),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    ttlSeconds: z.number().int().min(60).max(3600),
  })
  .strict();

export type SignR2GetUrlInput = z.infer<typeof SignR2GetUrlInputSchema>;

export interface SignR2GetUrlResult {
  readonly url: string;
  readonly expiresAt: number;
}

function buildEndpointUrl(accountId: string, bucket: string, objectKey: string, ttl: number): URL {
  const url = new URL(
    `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeObjectKey(objectKey)}`,
  );
  url.searchParams.set("X-Amz-Expires", String(ttl));
  return url;
}

function encodeObjectKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Signs a presigned GET URL for an R2 object. Browser fetches the
 * returned URL directly; Worker is never in the bytes path.
 */
export async function signR2GetUrl(rawInput: SignR2GetUrlInput): Promise<SignR2GetUrlResult> {
  const input = SignR2GetUrlInputSchema.parse(rawInput);
  const client = new AwsClient({
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const endpoint = buildEndpointUrl(input.accountId, input.bucket, input.objectKey, input.ttlSeconds);
  const signed = await client.sign(new Request(endpoint.toString(), { method: "GET" }), {
    aws: { signQuery: true },
  });
  return {
    url: signed.url.toString(),
    expiresAt: Date.now() + input.ttlSeconds * 1000,
  };
}
