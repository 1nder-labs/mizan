/**
 * Form-state helpers for the campaign intake form: RHF default values, the
 * create/edit mutation, and the pre-first-save localStorage autosave. Split out
 * of `intake-form.tsx` to keep that file within the 400-LOC budget and to keep
 * the persistence wiring testable in isolation.
 */
import { useEffect } from "react";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { DefaultValues, UseFormReturn } from "react-hook-form";
import type { CampaignCreate, CampaignMutationResponse } from "@mizan/shared";
import { ApiError } from "@/lib/api-errors.ts";
import {
  clearCampaignDraft,
  writeCampaignDraft,
  type CampaignDraft,
} from "@/lib/campaign-draft.ts";
import { createCampaign, editCampaign } from "@/lib/portal-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";

const CONFLICT_CODE = "case_no_longer_draft";

/**
 * RHF default values from optional initial data. Unset enum + optional keys are
 * omitted (not set to `undefined`) so the object satisfies
 * `exactOptionalPropertyTypes`.
 */
export function buildDefaultValues(
  initial: CampaignDraft | undefined,
): DefaultValues<CampaignCreate> {
  return {
    title: initial?.title ?? "",
    story: initial?.story ?? "",
    organizer_name: initial?.organizer_name ?? "",
    geography: initial?.geography ?? "",
    ...(initial?.category ? { category: initial.category } : {}),
    ...(initial?.claimed_zakat_category
      ? { claimed_zakat_category: initial.claimed_zakat_category }
      : {}),
    ...(initial?.vouching_narrative ? { vouching_narrative: initial.vouching_narrative } : {}),
  };
}

/**
 * When `persistKey` is set, mirrors form changes into localStorage so a refresh
 * before the first server save restores the typed details.
 */
export function useDraftPersistence(
  form: UseFormReturn<CampaignCreate>,
  persistKey: string | undefined,
): void {
  useEffect(() => {
    if (persistKey === undefined) return;
    const sub = form.watch(() => writeCampaignDraft(persistKey, form.getValues()));
    return () => sub.unsubscribe();
  }, [form, persistKey]);
}

export function useIntakeMutation(
  mode: "create" | "edit",
  campaignId: string | undefined,
  onDone: (id: string) => void | Promise<void>,
  setConflictError: (v: boolean) => void,
  persistKey: string | undefined,
): UseMutationResult<CampaignMutationResponse, Error, CampaignCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CampaignCreate) => {
      if (mode === "edit" && campaignId) return editCampaign(campaignId, values);
      return createCampaign(values);
    },
    onSuccess: async (result) => {
      if (persistKey !== undefined) clearCampaignDraft(persistKey);
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.campaigns() });
      if (mode === "edit" && campaignId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.portal.campaign(campaignId) });
      }
      await onDone(result.id);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.code === CONFLICT_CODE) setConflictError(true);
    },
  });
}
