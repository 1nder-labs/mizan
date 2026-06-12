import type { CaseNote } from "@mizan/shared";

/**
 * Maps a note's persisted `author_role` to a caller-supplied display label.
 *
 * Notes carry the sender's real role (`admin` | `reviewer` | `client`), so the
 * UI can name the sender by role instead of collapsing every staff message to a
 * single "Reviewer". The label set is a total map over the role union, so the
 * lookup is exhaustive at the type level — a new role can't be added without
 * the compiler forcing a label for it. The two threads (client-facing portal,
 * reviewer-side messages) pass their own copy strings.
 */
export function senderLabel(
  role: CaseNote["authorRole"],
  labels: Record<CaseNote["authorRole"], string>,
): string {
  return labels[role];
}
