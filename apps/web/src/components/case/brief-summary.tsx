/**
 * Persisted-brief summary card — recommendation, confidence,
 * verification path, geography tier, policy-grounded flag,
 * extracted claims. Renders after the workflow finishes.
 *
 * All technical identifiers (`OFAC_ADJACENT`, `community_vouching`,
 * etc.) are humanised before display so the reviewer surface stays
 * comprehensible at a glance.
 */
import { TriangleAlert, ShieldAlert, ShieldCheck } from "lucide-react";
import type { BriefPayload } from "@mizan/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { InfoHint } from "@/components/ui/info-hint.tsx";
import { COPY } from "@/lib/copy-constants.ts";
import { humanGeography, humanVerification } from "@/lib/display-labels.ts";
import { formatMediumDateTime } from "@/lib/format.ts";
import { wrapCitations } from "./citation-wrap.tsx";
import { RecommendationBadge } from "./recommendation-badge.tsx";

function Stat({
  label,
  value,
  hint,
  info,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly hint?: string;
  readonly info?: string;
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
        {info ? <InfoHint label={info} /> : null}
      </p>
      <p className="text-sm font-medium text-foreground">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function PolicyFlag({ grounded }: { readonly grounded: boolean }): React.JSX.Element {
  if (grounded) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-success-foreground">
        <ShieldCheck className="size-3.5" />
        Grounded in policy
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-status-warning-foreground">
      <ShieldAlert className="size-3.5" />
      No policy match
    </span>
  );
}

function EscalationNotice({ reason }: { readonly reason: string }): React.JSX.Element {
  return (
    <Alert>
      <AlertTitle className="flex items-center gap-2 text-sm">
        <TriangleAlert className="size-4" />
        Escalation required
      </AlertTitle>
      <AlertDescription className="text-sm leading-relaxed">{reason}</AlertDescription>
    </Alert>
  );
}

/** The four headline stats with their helper hints. */
function BriefStatGrid({ payload }: { readonly payload: BriefPayload }): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat
        label="Confidence"
        value={
          <span className="font-numeric text-lg font-semibold tracking-[-0.01em]">
            {payload.confidence}
          </span>
        }
        hint="out of 100"
        info={COPY.hints.confidence}
      />
      <Stat
        label="Verification"
        value={humanVerification(payload.verification_path)}
        info={COPY.hints.verificationPath}
      />
      <Stat
        label="Geography"
        value={humanGeography(payload.geography_tier)}
        info={COPY.hints.geographyTier}
      />
      <Stat
        label="Policy"
        value={<PolicyFlag grounded={payload.policy_grounded} />}
        info={COPY.hints.policyGrounded}
      />
    </div>
  );
}

export function BriefSummaryCard({
  payload,
  composedAt,
}: {
  readonly payload: BriefPayload;
  readonly composedAt: number;
}): React.JSX.Element {
  return (
    <Card className="border-border/80 shadow-elev-2">
      <CardHeader className="flex flex-row items-start justify-between gap-3 gap-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Recommendation
          </CardTitle>
          <p className="text-xs tabular text-muted-foreground">
            Composed {formatMediumDateTime(composedAt)}
          </p>
        </div>
        <RecommendationBadge
          recommendation={payload.recommendation}
          className="px-3 py-1.5 text-xs font-semibold tracking-wide"
        />
      </CardHeader>
      <CardContent className="space-y-6">
        <BriefStatGrid payload={payload} />
        {payload.forced_escalate_reason ? (
          <EscalationNotice reason={payload.forced_escalate_reason} />
        ) : null}
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Why this recommendation
          </p>
          <p className="text-sm leading-relaxed text-foreground">
            {wrapCitations(payload.extracted_claims, payload.policy_citations)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
