import { z } from "zod";

/** The reviewer case-detail tabs, in display order. The active tab lives in the URL (`?tab=`). */
export const CASE_TAB_VALUES = ["overview", "brief", "signals", "documents", "messages"] as const;

export const CaseTabEnum = z.enum(CASE_TAB_VALUES);
export type CaseTab = z.infer<typeof CaseTabEnum>;
