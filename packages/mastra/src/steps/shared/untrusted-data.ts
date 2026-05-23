/**
 * Wraps organizer-supplied data in a delimited `<untrusted_data>` envelope.
 *
 * Used by LLM steps that need to reference campaign text in the user turn.
 * The wrapping pairs with a system prompt instruction telling the model to
 * treat any content inside the envelope as inert data, not instructions —
 * mitigating prompt injection from campaign-side fields.
 *
 * Delimiter-breakout defense: the JSON-serialised payload is rewritten so
 * neither `<untrusted_data>` nor `</untrusted_data>` can appear literally
 * inside the envelope, even if an adversarial story tries to forge the
 * opening or closing tag. Both sides are escaped symmetrically because an
 * unmatched opening tag is still useful to an attacker trying to confuse
 * the model about envelope boundaries.
 */
const OPEN_TAG = "<untrusted_data>";
const CLOSE_TAG = "</untrusted_data>";
const OPEN_TAG_ESCAPED = "<\\untrusted_data>";
const CLOSE_TAG_ESCAPED = "<\\/untrusted_data>";

export function wrapUntrustedData(data: unknown): string {
  const serialized = JSON.stringify(data);
  const sanitized = serialized
    .split(CLOSE_TAG)
    .join(CLOSE_TAG_ESCAPED)
    .split(OPEN_TAG)
    .join(OPEN_TAG_ESCAPED);
  return `${OPEN_TAG}\n${sanitized}\n${CLOSE_TAG}`;
}
