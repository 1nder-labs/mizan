/**
 * Formats one W3C Server-Sent Events frame.
 */
export function formatSseEvent(input: {
  readonly id: number;
  readonly event: string;
  readonly data: unknown;
}): string {
  return `id: ${String(input.id)}\nevent: ${input.event}\ndata: ${JSON.stringify(input.data)}\n\n`;
}
