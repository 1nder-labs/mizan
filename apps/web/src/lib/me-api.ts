import { queryOptions } from "@tanstack/react-query";
import { MeResponseSchema, type MeResponse } from "@mizan/shared";
import { api } from "./rpc.ts";
import { apiError } from "./api-errors.ts";

export const ME_QUERY_KEY = ["me"] as const;

/** TanStack Query options for the org-scoped `/api/me` identity probe. */
export function meQueryOptions() {
  return queryOptions<MeResponse>({
    queryKey: [...ME_QUERY_KEY],
    queryFn: async () => {
      const res = await api.me.$get();
      if (!res.ok) throw await apiError(res);
      return MeResponseSchema.parse(await res.json());
    },
    staleTime: 60_000,
  });
}
