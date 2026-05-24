/**
 * Shared sign-out mutation. Reused by `/queue` and `/admin/audit`
 * header chrome so the logout flow stays single-source.
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
      await queryClient.invalidateQueries({ queryKey: [...SESSION_QUERY_KEY] });
      await navigate({ to: "/login" });
    },
  });
  return { signOut: () => mutation.mutate(), signingOut: mutation.isPending };
}
