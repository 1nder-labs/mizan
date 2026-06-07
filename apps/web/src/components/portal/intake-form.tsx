/**
 * Campaign intake form — create or edit mode. RHF + zodResolver over
 * `CampaignCreateSchema`. Category + Zakat category are dropdowns from the
 * centralized `@mizan/shared` taxonomy; country is a searchable combobox — so
 * a client picks from a closed list and the server rejects off-list values.
 * Fields are grouped into labelled sections with help text. A 409
 * (`case_no_longer_draft`) surfaces as a top-level alert.
 */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Loader2 } from "lucide-react";
import { useForm, type Control } from "react-hook-form";
import {
  CAMPAIGN_CATEGORY_OPTIONS,
  CampaignCreateSchema,
  ZAKAT_CATEGORY_OPTIONS,
  type CampaignCreate,
} from "@mizan/shared";
import { readCampaignDraft } from "@/lib/campaign-draft.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { CountryCombobox } from "./country-combobox.tsx";
import { buildDefaultValues, useDraftPersistence, useIntakeMutation } from "./intake-form-state.ts";

interface IntakeFormProps {
  readonly mode: "create" | "edit";
  readonly campaignId?: string;
  readonly initial?: Partial<CampaignCreate>;
  readonly onDone: (id: string) => void | Promise<void>;
  readonly onCancel?: () => void;
  readonly persistKey?: string;
}

type FieldProps = { readonly control: Control<CampaignCreate> };

const ZAKAT_NONE = "none";

function StoryField({ control }: FieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="story"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{COPY.portal.intakeStory}</FormLabel>
          <FormControl>
            <Textarea rows={5} placeholder={COPY.portal.intakeStoryPlaceholder} {...field} />
          </FormControl>
          <FormDescription>{COPY.portal.intakeStoryHelp}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function OrganizerField({ control }: FieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="organizer_name"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{COPY.portal.intakeOrganizer}</FormLabel>
          <FormControl>
            <Input placeholder={COPY.portal.intakeOrganizerPlaceholder} {...field} />
          </FormControl>
          <FormDescription>{COPY.portal.intakeOrganizerHelp}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function CategoryField({ control }: FieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="category"
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>{COPY.portal.intakeCategory}</FormLabel>
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger aria-invalid={!!fieldState.error}>
                <SelectValue placeholder={COPY.portal.intakeCategoryPlaceholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {CAMPAIGN_CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription>{COPY.portal.intakeCategoryHelp}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function GeographyField({ control }: FieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="geography"
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>{COPY.portal.intakeGeography}</FormLabel>
          <FormControl>
            <CountryCombobox
              value={field.value}
              onChange={field.onChange}
              invalid={!!fieldState.error}
            />
          </FormControl>
          <FormDescription>{COPY.portal.intakeGeographyHelp}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ZakatField({ control }: FieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="claimed_zakat_category"
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-2">
            {COPY.portal.intakeZakat}
            <span className="text-xs font-normal text-muted-foreground">
              {COPY.portal.fieldOptional}
            </span>
          </FormLabel>
          <Select
            value={field.value ?? ""}
            onValueChange={(v) => field.onChange(v === ZAKAT_NONE ? undefined : v)}
          >
            <FormControl>
              <SelectTrigger aria-invalid={!!fieldState.error}>
                <SelectValue placeholder={COPY.portal.intakeZakatPlaceholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={ZAKAT_NONE}>{COPY.portal.intakeZakatNone}</SelectItem>
              {ZAKAT_CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription>{COPY.portal.intakeZakatHelp}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function VouchingField({ control }: FieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="vouching_narrative"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-2">
            {COPY.portal.intakeVouching}
            <span className="text-xs font-normal text-muted-foreground">
              {COPY.portal.fieldOptional}
            </span>
          </FormLabel>
          <FormControl>
            <Textarea
              rows={3}
              placeholder={COPY.portal.intakeVouchingPlaceholder}
              {...field}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value || undefined)}
            />
          </FormControl>
          <FormDescription>{COPY.portal.intakeVouchingHelp}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function FormSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="space-y-4">
      <h3 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DocsCallout(): React.JSX.Element {
  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 shadow-elev-1">
      <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{COPY.portal.intakeDocsTitle}</p>
        <p className="text-sm text-muted-foreground">{COPY.portal.intakeDocsBody}</p>
      </div>
    </div>
  );
}

function SubmitRow({
  isPending,
  isEdit,
  onCancel,
}: {
  readonly isPending: boolean;
  readonly isEdit: boolean;
  readonly onCancel?: () => void;
}): React.JSX.Element {
  return (
    <div className="flex gap-3 pt-4">
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            {COPY.portal.intakePending}
          </>
        ) : isEdit ? (
          COPY.portal.editSubmit
        ) : (
          COPY.portal.intakeSubmit
        )}
      </Button>
      {onCancel ? (
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          {COPY.portal.intakeCancel}
        </Button>
      ) : null}
    </div>
  );
}

function IntakeAlerts({
  conflict,
  error,
}: {
  readonly conflict: boolean;
  readonly error: Error | null;
}): React.JSX.Element | null {
  if (conflict) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTitle>{COPY.portal.editConflict}</AlertTitle>
      </Alert>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTitle>{COPY.portal.intakeError}</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

function IntakeFields({
  control,
  mode,
}: {
  readonly control: Control<CampaignCreate>;
  readonly mode: "create" | "edit";
}): React.JSX.Element {
  return (
    <>
      <FormSection title={COPY.portal.intakeSectionAbout}>
        <StoryField control={control} />
        <OrganizerField control={control} />
      </FormSection>
      <FormSection title={COPY.portal.intakeSectionClassify}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CategoryField control={control} />
          <GeographyField control={control} />
        </div>
        <ZakatField control={control} />
      </FormSection>
      <FormSection title={COPY.portal.intakeSectionCommunity}>
        <VouchingField control={control} />
      </FormSection>
      {mode === "create" ? <DocsCallout /> : null}
    </>
  );
}

export function IntakeForm({
  mode,
  campaignId,
  initial,
  onDone,
  onCancel,
  persistKey,
}: IntakeFormProps): React.JSX.Element {
  const [conflictError, setConflictError] = useState(false);
  const [restored] = useState(() => (persistKey ? readCampaignDraft(persistKey) : undefined));
  const mutation = useIntakeMutation(mode, campaignId, onDone, setConflictError, persistKey);
  const form = useForm<CampaignCreate>({
    resolver: zodResolver(CampaignCreateSchema),
    defaultValues: buildDefaultValues(restored ?? initial),
    mode: "onTouched",
  });
  useDraftPersistence(form, persistKey);

  function onSubmit(values: CampaignCreate): void {
    setConflictError(false);
    mutation.mutate(values);
  }

  return (
    <>
      <IntakeAlerts
        conflict={conflictError}
        error={mutation.isError && !conflictError ? mutation.error : null}
      />
      <Form {...form}>
        <form className="space-y-10" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <IntakeFields control={form.control} mode={mode} />
          <SubmitRow
            isPending={mutation.isPending}
            isEdit={mode === "edit"}
            {...(onCancel ? { onCancel } : {})}
          />
        </form>
      </Form>
    </>
  );
}
