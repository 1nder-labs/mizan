import { authClient } from "@/lib/auth-client.ts";

/**
 * Active organization + membership list from the better-auth organization client.
 */
export function useActiveOrg(): {
  readonly orgs: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly activeOrg: { readonly id: string; readonly name: string } | null;
  readonly isLoading: boolean;
} {
  const orgs = authClient.useListOrganizations();
  const active = authClient.useActiveOrganization();
  return {
    orgs: orgs.data ?? [],
    activeOrg: active.data ?? null,
    isLoading: orgs.isPending || active.isPending,
  };
}
