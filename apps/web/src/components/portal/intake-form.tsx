/**
 * Campaign intake form — create or edit mode. RHF + zodResolver over
 * `CampaignCreateSchema`. In create mode calls `createCampaign`; in edit
 * mode calls `editCampaign`. On success invalidates the portal query cache
 * and calls `onDone(id)`. A 409 (case_no_longer_draft) surfaces as a
 * top-level alert, mirroring the server's `case_no_longer_draft` error code.
 */
import { useState } from "react";
import { useQueryClient, useMutation, type UseMutationResult } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, type UseFormReturn } from "react-hook-form";
import {
  CampaignCreateSchema,
  type CampaignCreate,
  type CampaignMutationResponse,
} from "@mizan/shared";
import { createCampaign, editCampaign } from "@/lib/portal-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

interface IntakeFormProps {
  readonly mode: "create" | "edit";
  readonly campaignId?: string;
  readonly initial?: Partial<CampaignCreate>;
  readonly onDone: (id: string) => void | Promise<void>;
  readonly onCancel?: () => void;
}

const CONFLICT_CODE = "409";

function StoryField({ form }: { readonly form: UseFormReturn<CampaignCreate> }): React.JSX.Element {
  return (
    <FormField
      control={form.control}
      name="story"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{COPY.portal.intakeStory}</FormLabel>
          <FormControl>
            <Textarea rows={5} placeholder={COPY.portal.intakeStoryPlaceholder} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function OrganizerCategoryFields({
  form,
}: {
  readonly form: UseFormReturn<CampaignCreate>;
}): React.JSX.Element {
  return (
    <>
      <FormField
        control={form.control}
        name="organizer_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{COPY.portal.intakeOrganizer}</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{COPY.portal.intakeCategory}</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="geography"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{COPY.portal.intakeGeography}</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

function OptionalFields({
  form,
}: {
  readonly form: UseFormReturn<CampaignCreate>;
}): React.JSX.Element {
  return (
    <>
      <FormField
        control={form.control}
        name="claimed_zakat_category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{COPY.portal.intakeZakat}</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || undefined)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="vouching_narrative"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{COPY.portal.intakeVouching}</FormLabel>
            <FormControl>
              <Textarea
                rows={3}
                {...field}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || undefined)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
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
    <div className="flex gap-3 pt-2">
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

function buildDefaultValues(initial: Partial<CampaignCreate> | undefined): CampaignCreate {
  return {
    story: initial?.story ?? "",
    organizer_name: initial?.organizer_name ?? "",
    category: initial?.category ?? "",
    geography: initial?.geography ?? "",
    claimed_zakat_category: initial?.claimed_zakat_category ?? undefined,
    vouching_narrative: initial?.vouching_narrative ?? undefined,
  };
}

function useIntakeMutation(
  mode: "create" | "edit",
  campaignId: string | undefined,
  onDone: (id: string) => void | Promise<void>,
  setConflictError: (v: boolean) => void,
): UseMutationResult<CampaignMutationResponse, Error, CampaignCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CampaignCreate) => {
      if (mode === "edit" && campaignId) return editCampaign(campaignId, values);
      return createCampaign(values);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.campaigns() });
      if (mode === "edit" && campaignId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.portal.campaign(campaignId) });
      }
      await onDone(result.id);
    },
    onError: (err: Error) => {
      if (err.message.includes(CONFLICT_CODE)) setConflictError(true);
    },
  });
}

export function IntakeForm({
  mode,
  campaignId,
  initial,
  onDone,
  onCancel,
}: IntakeFormProps): React.JSX.Element {
  const [conflictError, setConflictError] = useState(false);
  const mutation = useIntakeMutation(mode, campaignId, onDone, setConflictError);
  const form = useForm<CampaignCreate>({
    resolver: zodResolver(CampaignCreateSchema),
    defaultValues: buildDefaultValues(initial),
    mode: "onTouched",
  });

  function onSubmit(values: CampaignCreate): void {
    setConflictError(false);
    mutation.mutate(values);
  }

  return (
    <>
      {conflictError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{COPY.portal.editConflict}</AlertTitle>
        </Alert>
      ) : null}
      {mutation.isError && !conflictError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{COPY.portal.intakeError}</AlertTitle>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <StoryField form={form} />
          <OrganizerCategoryFields form={form} />
          <OptionalFields form={form} />
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
