/**
 * Builds canned MOCK_LLM_RESPONSES maps for integration tests and eval fixtures.
 */

import {
  case001Responses,
  case002Responses,
  case003Responses,
  case004Responses,
  case005Responses,
} from "./documentary.ts";
import { case006Responses, case007Responses, case008Responses } from "./community.ts";

export {
  case001Responses,
  case002Responses,
  case003Responses,
  case004Responses,
  case005Responses,
  case006Responses,
  case007Responses,
  case008Responses,
};

/** Serializes a canned map for `env.MOCK_LLM_RESPONSES`. */
export function serializeMockResponses(map: Record<string, unknown>): string {
  return JSON.stringify(map);
}

/** All eight seed case ids in load order. */
export const SEED_CASE_IDS = [
  "11111111-1111-4111-8111-111111111101",
  "11111111-1111-4111-8111-111111111102",
  "11111111-1111-4111-8111-111111111103",
  "11111111-1111-4111-8111-111111111104",
  "11111111-1111-4111-8111-111111111105",
  "11111111-1111-4111-8111-111111111106",
  "11111111-1111-4111-8111-111111111107",
  "11111111-1111-4111-8111-111111111108",
] as const;

/** Returns the canned map builder for a seed case index (0–7). */
export function responsesForCaseIndex(index: number): Record<string, unknown> {
  switch (index) {
    case 0:
      return case001Responses();
    case 1:
      return case002Responses();
    case 2:
      return case003Responses();
    case 3:
      return case004Responses();
    case 4:
      return case005Responses();
    case 5:
      return case006Responses();
    case 6:
      return case007Responses();
    case 7:
      return case008Responses();
    default:
      throw new Error(`unknown seed case index ${String(index)}`);
  }
}
