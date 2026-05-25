/**
 * Shared sign-out mutation. Reused by `/queue` and `/admin/audit`
 * header chrome so the logout flow stays single-source.
 *
 * After `authClient.signOut()` clears the server cookie, the local
 * cache entry is force-invalidated with `refetchType: 'all'`
 * (TanStack Query canonical for inactive caches) so the next
 * `ensureQueryData` call from `requireSession` re-fetches and sees
 * the now-cleared session.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authClient, SESSION_QUERY_KEY } from "@/lib/auth-client.ts";

export function useSignOut(): { readonly signOut: () => void; readonly signingOut: boolean } {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [...SESSION_QUERY_KEY],
        refetchType: "all",
      });
      await navigate({ to: "/login" });
    },
  });
  return { signOut: () => mutation.mutate(), signingOut: mutation.isPending };
}
