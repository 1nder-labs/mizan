import { describe, expect, it } from "bun:test";
import { OcrMismatchPayloadSchema } from "@mizan/shared";
import { composeOcrMismatch, type OcrMismatchInput } from "../../src/steps/ocrMismatch/helpers.ts";

const BASE: OcrMismatchInput = {
  organizerName: "Amina Yusuf",
  idFullName: "Amina Yusuf",
  idMatchesOrganizer: true,
  idMatchReason: undefined,
  bankAccountHolder: undefined,
  bankMatchesOrganizer: undefined,
  bankMatchReason: undefined,
};

describe("composeOcrMismatch", () => {
  it("emits a schema-valid payload", () => {
    expect(() => OcrMismatchPayloadSchema.parse(composeOcrMismatch(BASE))).not.toThrow();
  });

  it("treats a missing ID name as unverified, not a silent pass", () => {
    const out = composeOcrMismatch({ ...BASE, idFullName: undefined, idMatchesOrganizer: true });
    expect(out.id_full_name).toBe("");
    expect(out.name_matches_organizer).toBe(false);
    expect(out.id_match_reason).toBe(
      "No creator-ID name was extracted, so identity is unverified.",
    );
    expect(out.summary).toContain("could not be verified");
  });

  it("prefers the model's id reason when present", () => {
    const out = composeOcrMismatch({ ...BASE, idMatchReason: "Exact match on both names." });
    expect(out.id_match_reason).toBe("Exact match on both names.");
  });

  it("falls back to a verdict-keyed id reason when the model gave none", () => {
    expect(composeOcrMismatch({ ...BASE, idMatchesOrganizer: true }).id_match_reason).toBe(
      "The ID names the claimed organizer.",
    );
    expect(
      composeOcrMismatch({ ...BASE, idFullName: "Bilal Khan", idMatchesOrganizer: false })
        .id_match_reason,
    ).toBe("The ID names a different person.");
  });

  it("nulls every bank field when there is no bank extraction", () => {
    const out = composeOcrMismatch(BASE);
    expect(out.bank_account_holder_name).toBeNull();
    expect(out.bank_account_holder_matches).toBeNull();
    expect(out.bank_match_reason).toBeNull();
  });

  it("carries the bank verdict and reason when a bank holder is present", () => {
    const out = composeOcrMismatch({
      ...BASE,
      bankAccountHolder: "Amina Yusuf",
      bankMatchesOrganizer: true,
      bankMatchReason: "Bank holder equals organizer.",
    });
    expect(out.bank_account_holder_name).toBe("Amina Yusuf");
    expect(out.bank_account_holder_matches).toBe(true);
    expect(out.bank_match_reason).toBe("Bank holder equals organizer.");
  });

  it("defaults the bank verdict to false when the holder exists but no judgment was made", () => {
    const out = composeOcrMismatch({ ...BASE, bankAccountHolder: "Someone Else" });
    expect(out.bank_account_holder_matches).toBe(false);
    expect(out.bank_match_reason).toBeNull();
  });
});
