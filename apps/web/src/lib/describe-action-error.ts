import { ReviewerActionError } from "./api-errors.ts";

/**
 * Maps a reviewer-action failure to user-facing copy. Shared by the inline
 * action panel and the kanban action modal so both drag and form paths render
 * the same message for a given `ReviewerActionError.code`.
 */
export function describeActionError(error: unknown): string {
  if (!(error instanceof ReviewerActionError)) {
    return error instanceof Error ? error.message : "Action failed";
  }
  switch (error.code) {
    case "not_suspended_or_claimed":
      return "Another reviewer acted on this case";
    case "not_found":
      return "Case not found";
    case "no_run":
      return "Case has no active workflow run";
    case "workflow_failed":
      return "Workflow failed to resume — try again";
  }
}
