/**
 * `vouching_chain` signal body — surfaces the chain structure plus the
 * weakest-link narrative the LLM extracted. Partner-org structures
 * surface the org name explicitly so reviewers can spot-check against
 * the organizer's vouching_narrative.
 *
 * Persisted shape is the variant directly (per `vouching.ts`
 * `VouchingChainVariantSchema`), not the LLM envelope — readers
 * access `payload.structure` without an extra `.chain` hop.
 */
import type { VouchingChain } from "@mizan/shared";

interface VouchingChainBodyProps {
  readonly payload: VouchingChain;
}

const STRUCTURE_LABEL: Readonly<Record<VouchingChain["structure"], string>> = {
  none: "No accountability chain identified",
  "individual-to-individual": "Community vouching",
  "individual-via-partner-org": "Partner organization route",
  "org-direct": "Direct organizational route",
};

export function VouchingChainBody({ payload: chain }: VouchingChainBodyProps): React.JSX.Element {
  const partnerOrg =
    chain.structure === "individual-via-partner-org" || chain.structure === "org-direct"
      ? chain.partner_org_name
      : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border/60 bg-muted px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-foreground">
          {STRUCTURE_LABEL[chain.structure]}
        </span>
        {partnerOrg ? (
          <span className="text-xs text-muted-foreground">
            Partner: <span className="text-foreground">{partnerOrg}</span>
          </span>
        ) : null}
      </div>
      <div className="rounded-md border border-border/40 bg-muted/20 p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Weakest link</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {chain.weakest_link_narrative}
        </p>
      </div>
    </div>
  );
}
