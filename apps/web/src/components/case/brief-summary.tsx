/**
 * Persisted-brief summary card — recommendation, confidence,
 * verification path, geography tier, policy-grounded flag,
 * extracted claims. Renders after the workflow finishes.
 */
import { CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import type { BriefPayload } from "@mizan/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
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
        Policy grounded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-status-warning-foreground">
      <ShieldAlert className="size-3.5" />
      Composed without policy
    </span>
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
            Composed {new Date(composedAt).toLocaleString()}
          </p>
        </div>
        <RecommendationBadge recommendation={payload.recommendation} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Confidence" value={`${payload.confidence}`} hint="0–100" />
          <Stat label="Verification" value={payload.verification_path.replace(/_/g, " ").toLowerCase()} />
          <Stat label="Geography tier" value={`Tier ${payload.geography_tier}`} />
          <Stat label="Status" value={<PolicyFlag grounded={payload.policy_grounded} />} />
        </div>
        {payload.forced_escalate_reason ? (
          <Alert>
            <AlertTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4" />
              Forced escalate
            </AlertTitle>
            <AlertDescription>{payload.forced_escalate_reason}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Extracted claims
          </p>
          <p className="text-sm leading-relaxed text-foreground">{payload.extracted_claims}</p>
        </div>
      </CardContent>
    </Card>
  );
}
