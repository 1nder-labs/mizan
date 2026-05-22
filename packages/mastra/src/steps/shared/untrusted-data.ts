/**
 * Wraps organizer-supplied data in a delimited `<untrusted_data>` envelope.
 *
 * Used by LLM steps that need to reference campaign text in the user turn.
 * The wrapping pairs with a system prompt instruction telling the model to
 * treat any content inside the envelope as inert data, not instructions —
 * mitigating prompt injection from campaign-side fields.
 *
 * Delimiter choice: literal XML-like tag. Models trained on instruction
 * data recognize this convention; an attacker would need to forge the tag
 * boundary plus the closing tag inside the data, which we defend against
 * by always serializing through JSON.stringify before injection.
 */
export function wrapUntrustedData(data: unknown): string {
  return `<untrusted_data>\n${JSON.stringify(data)}\n</untrusted_data>`;
}
