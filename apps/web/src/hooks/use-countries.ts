import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { COUNTRIES, COUNTRY_CODE_SET, countryFlag } from "@mizan/shared";
import { externalGet } from "../lib/rpc.ts";

export interface CountryOption {
  readonly code: string;
  readonly name: string;
  readonly flag: string;
}

const COUNTRIES_API = "https://restcountries.com/v3.1/all?fields=name,cca2,flag";

const RestCountriesSchema = z.array(
  z.object({
    cca2: z.string(),
    flag: z.string().optional(),
    name: z.object({ common: z.string() }),
  }),
);

const FALLBACK: readonly CountryOption[] = COUNTRIES.map((c) => ({
  code: c.code,
  name: c.name,
  flag: countryFlag(c.code),
}));

async function fetchCountries(): Promise<readonly CountryOption[]> {
  const res = await externalGet(COUNTRIES_API);
  if (!res.ok) return FALLBACK;
  const parsed = RestCountriesSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return FALLBACK;
  const list = parsed.data
    .filter((c) => COUNTRY_CODE_SET.has(c.cca2))
    .map((c) => ({ code: c.cca2, name: c.name.common, flag: c.flag ?? countryFlag(c.cca2) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return list.length > 0 ? list : FALLBACK;
}

/**
 * Country options for the geography picker — names + emoji flags from
 * restcountries.com (open-source), filtered to the validatable code set and
 * cached for the session. Always resolves (falls back to the bundled ISO/Intl
 * list), so the picker works offline or if the API is unreachable.
 */
export function useCountries(): readonly CountryOption[] {
  const { data } = useQuery({
    queryKey: ["countries"],
    queryFn: fetchCountries,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  return data ?? FALLBACK;
}
