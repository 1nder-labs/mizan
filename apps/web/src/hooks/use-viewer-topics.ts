import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "@/lib/auth-client.ts";

interface ViewerTopics {
  readonly orgId: string | undefined;
  readonly userId: string | undefined;
}

function readActiveOrganizationId(
  session:
    | {
        readonly session?: { readonly activeOrganizationId?: string | null };
      }
    | null
    | undefined,
): string | undefined {
  const orgId = session?.session?.activeOrganizationId;
  return typeof orgId === "string" ? orgId : undefined;
}

/**
 * Reads active-org + user ids from the better-auth session for live-event topics.
 */
export function useViewerTopics(): ViewerTopics {
  const { data: session } = useQuery(sessionQueryOptions());
  return {
    orgId: readActiveOrganizationId(session),
    userId: session?.user?.id,
  };
}
