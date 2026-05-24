/**
 * Image helpers for multimodal LLM messages.
 *
 * Two concerns the call sites should not have to know about:
 *
 *   1. R2 keys carry conventional extensions, not enforced ones — a
 *      `.png` key may hold a JPEG. Using the wrong `mediaType` causes
 *      a provider-side parse failure (OpenAI: "invalid base64-encoded
 *      value", Anthropic: "Could not parse image").
 *   2. AI SDK 6's OpenAI provider on the Responses API rejects raw
 *      `Uint8Array` AND raw base64 strings — it requires the full
 *      `data:<mediaType>;base64,<payload>` URL in `image_url`.
 *
 * `toImagePart` sniffs the format from magic bytes, builds the data
 * URL, and returns the canonical `ImagePart` shape AI SDK 6 accepts
 * across providers.
 */

interface ImageSignature {
  readonly mediaType: string;
  readonly header: ReadonlyArray<number>;
  readonly verify?: (bytes: Uint8Array) => boolean;
}

const SIGNATURES: ReadonlyArray<ImageSignature> = [
  { mediaType: "image/png", header: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mediaType: "image/jpeg", header: [0xff, 0xd8, 0xff] },
  { mediaType: "image/gif", header: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { mediaType: "image/gif", header: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  {
    mediaType: "image/webp",
    header: [0x52, 0x49, 0x46, 0x46],
    verify: (b) =>
      b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  { mediaType: "image/bmp", header: [0x42, 0x4d] },
];

function matchesHeader(bytes: Uint8Array, header: ReadonlyArray<number>): boolean {
  if (bytes.length < header.length) return false;
  for (let i = 0; i < header.length; i += 1) {
    if (bytes[i] !== header[i]) return false;
  }
  return true;
}

/** Detects the image media type from magic bytes; `null` when no match. */
export function detectImageMediaType(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    if (!matchesHeader(bytes, sig.header)) continue;
    if (sig.verify && !sig.verify(bytes)) continue;
    return sig.mediaType;
  }
  return null;
}

/**
 * Encodes raw bytes as a `data:<mediaType>;base64,<payload>` URL.
 * Workers don't expose Node's `Buffer`, so we chunk the Uint8Array
 * through `String.fromCharCode` + `btoa`.
 */
function bytesToDataUrl(bytes: Uint8Array, mediaType: string): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}

/**
 * Builds the AI SDK 6 `ImagePart` shape for a binary image payload.
 * Sniffs media type from magic bytes, throws on unrecognised format,
 * and returns the canonical `{ type: "image", image: "data:..." }`
 * object every provider accepts.
 */
export function toImagePart(
  bytes: Uint8Array,
  sourceHint?: string,
): { readonly type: "image"; readonly image: string } {
  const mediaType = detectImageMediaType(bytes);
  if (!mediaType) {
    throw new Error(
      `toImagePart: bytes do not match any supported image format (PNG / JPEG / GIF / WebP / BMP)${
        sourceHint ? ` — source=${sourceHint}` : ""
      }`,
    );
  }
  const dataUrl = bytesToDataUrl(bytes, mediaType);
  console.log(
    `[toImagePart] source=${sourceHint ?? "?"} mediaType=${mediaType} bytes=${bytes.length} b64Len=${
      dataUrl.length
    } prefix=${dataUrl.slice(0, 40)} suffix=${dataUrl.slice(-20)}`,
  );
  return { type: "image", image: dataUrl };
}
