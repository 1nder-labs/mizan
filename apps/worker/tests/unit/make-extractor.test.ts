import { describe, expect, it } from "bun:test";
import {
  CreatorIdSchema,
  mockProvider,
  serializeMockResponses,
  case001Responses,
} from "@mizan/mastra";

describe("mockProvider + extractor schemas", () => {
  it("replays canned creator-id extraction keyed by schemaName", async () => {
    const map = serializeMockResponses(case001Responses());
    const model = mockProvider(map);
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "extract" }] }],
      responseFormat: { type: "json", name: "extractCreatorIdDoc.extract" },
    });
    const textPart = result.content.find((part) => part.type === "text");
    expect(textPart?.type).toBe("text");
    if (textPart?.type !== "text") throw new Error("expected text part");
    const parsed = CreatorIdSchema.parse(JSON.parse(textPart.text));
    expect(parsed.full_name).toBe("Mizan Demo Patient");
  });

  it("throws when schema key is missing and no default is provided", async () => {
    const model = mockProvider("{}");
    await expect(
      model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "extract" }] }],
        responseFormat: { type: "json", name: "missing.key" },
      }),
    ).rejects.toThrow("mock provider");
  });
});
