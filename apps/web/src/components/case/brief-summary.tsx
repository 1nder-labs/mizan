/**
 * Persisted-brief summary card — recommendation, confidence,
 * verification path, geography tier, policy-grounded flag,
 * extracted claims. Renders after the workflow finishes.
 *
 * All technical identifiers (`OFAC_ADJACENT`, `community_vouching`,
 * etc.) are humanised before display so the reviewer surface stays
 * comprehensible at a glance.
 */
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import type { BriefPayload } from "@mizan/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { humanGeography, humanVerification } from "@/lib/display-labels.ts";
import { formatMediumDateTime } from "@/lib/format.ts";
import { RecommendationBadge } from "./recommendation-badge.tsx";

function Stat({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly hint?: string;
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground tabular">{value}</p>
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
        <AlertTriangle className="size-4" />
        Escalation required
      </AlertTitle>
      <AlertDescription className="text-sm leading-relaxed">{reason}</AlertDescription>
    </Alert>
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
    <Card className="border-border/80 shadow-elev-1">
      <CardHeader className="flex flex-row items-start justify-between gap-3 gap-y-0">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium">Recommendation</CardTitle>
          <p className="text-xs text-muted-foreground">
            Composed {formatMediumDateTime(composedAt)}
          </p>
        </div>
        <RecommendationBadge recommendation={payload.recommendation} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Confidence" value={`${payload.confidence}`} hint="out of 100" />
          <Stat label="Verification" value={humanVerification(payload.verification_path)} />
          <Stat label="Geography" value={humanGeography(payload.geography_tier)} />
          <Stat label="Policy" value={<PolicyFlag grounded={payload.policy_grounded} />} />
        </div>
        {payload.forced_escalate_reason ? (
          <EscalationNotice reason={payload.forced_escalate_reason} />
        ) : null}
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Why this recommendation
          </p>
          <p className="text-sm leading-relaxed text-foreground">{payload.extracted_claims}</p>
        </div>
      </CardContent>
    </Card>
  );
}
