/**
 * `ocr_mismatch` signal body — does the name on the creator's government ID
 * match the claimed organizer (and bank-statement holder)?
 *
 * The verdict banner reflects the vision-LLM's semantic judgment
 * (`name_matches_organizer`), which is the gate — it survives the
 * transliteration / name-order variance a raw similarity score false-flags. The
 * Jaro-Winkler similarities below it are secondary, reviewer-facing context.
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

export function OcrMismatchBody({
  payload,
}: {
  readonly payload: OcrMismatchPayload;
}): React.JSX.Element {
  const matched = payload.name_matches_organizer;
  const bankSim = payload.bank_organizer_similarity;
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border p-3 text-[13px] leading-relaxed",
          matched
            ? "border-status-success-foreground/30 bg-status-success-foreground/10 text-foreground"
            : "border-status-destructive-foreground/30 bg-status-destructive-foreground/10 text-foreground",
        )}
      >
        {matched ? (
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
        <Field label="Bank account holder" value={payload.bank_account_holder_name ?? "—"} />
        <Field
          label="ID ↔ organizer similarity"
          value={`${(payload.id_organizer_similarity * 100).toFixed(0)}%`}
        />
        {bankSim !== null ? (
          <Field label="Bank ↔ organizer similarity" value={`${(bankSim * 100).toFixed(0)}%`} />
        ) : null}
      </dl>
    </div>
  );
}
