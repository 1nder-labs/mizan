import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { useActiveOrg } from "@/hooks/use-active-org.ts";
import { Button } from "@/components/ui/button.tsx";

/**
 * Footer control for switching the active organization when the user has multiple memberships.
 */
export function ActiveOrgSwitcher(): React.JSX.Element | null {
  const queryClient = useQueryClient();
  const { orgs, activeOrg } = useActiveOrg();

  if (orgs.length <= 1) return null;

  return (
    <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {COPY.org.switcherLabel}
      </p>
      <div className="flex flex-wrap gap-1">
        {orgs.map((org) => (
          <Button
            key={org.id}
            type="button"
            size="sm"
            variant={activeOrg?.id === org.id ? "default" : "outline"}
            onClick={() => {
              void authClient.organization.setActive({ organizationId: org.id }).then(() => {
                void queryClient.invalidateQueries();
              });
            }}
          >
            {org.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
