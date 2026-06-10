/**
 * `ocr_mismatch` signal body — is the name on the creator's government ID, and
 * the bank-statement holder, the same person as the claimed organizer?
 *
 * Both verdicts are the vision-LLM's semantic identity judgment, each shown with
 * its one-line reason. There is deliberately no similarity percentage: a
 * character-distance score floors unrelated names around 40–60% (reading as a
 * partial match) and false-flags transliteration variants, so the model's
 * reasoning is the reviewer-facing signal instead.
 */
import type { OcrMismatchPayload } from "@mizan/shared";
import { ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils.ts";

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

function VerdictField({
  label,
  matches,
  reason,
}: {
  readonly label: string;
  readonly matches: boolean;
  readonly reason: string;
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-sm font-medium",
          matches ? "text-status-success-foreground" : "text-status-destructive-foreground",
        )}
      >
        {matches ? "Same person" : "Different person"}
      </dd>
      {reason.length > 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{reason}</p>
      ) : null}
    </div>
  );
}

export function OcrMismatchBody({
  payload,
}: {
  readonly payload: OcrMismatchPayload;
}): React.JSX.Element {
  const matched = payload.name_matches_organizer;
  const bankMatches = payload.bank_account_holder_matches;
  const allClear = matched && bankMatches !== false;
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border p-3 text-[13px] leading-relaxed",
          allClear
            ? "border-status-success-foreground/30 bg-status-success-foreground/10 text-foreground"
            : "border-status-destructive-foreground/30 bg-status-destructive-foreground/10 text-foreground",
        )}
      >
        {allClear ? (
          <ShieldCheck className="size-4 shrink-0 text-status-success-foreground" />
        ) : (
          <ShieldX className="size-4 shrink-0 text-status-destructive-foreground" />
        )}
        <span>{payload.summary}</span>
      </div>
      <dl className="grid gap-3 rounded-xl border border-border/40 bg-muted/20 p-4 md:grid-cols-2">
        <Field label="Claimed organizer" value={payload.claimed_organizer_name} />
        <Field
          label="Name on ID"
          value={payload.id_full_name.length > 0 ? payload.id_full_name : "—"}
        />
        <VerdictField label="ID identity" matches={matched} reason={payload.id_match_reason} />
        <Field label="Bank account holder" value={payload.bank_account_holder_name ?? "—"} />
        {bankMatches !== null ? (
          <VerdictField
            label="Bank account identity"
            matches={bankMatches}
            reason={payload.bank_match_reason ?? ""}
          />
        ) : null}
      </dl>
    </div>
  );
}
