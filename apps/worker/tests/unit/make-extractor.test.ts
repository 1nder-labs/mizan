import { describe, expect, it } from "bun:test";
import { CreatorIdSchema } from "@mizan/mastra";
import {
  case001Responses,
  MissingMockResponseError,
  mockProvider,
  serializeMockResponses,
} from "@mizan/mastra/testing";

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

  it("throws MissingMockResponseError when schema key is missing and no default is provided", async () => {
    const model = mockProvider("{}");
    let caught: unknown;
    try {
      await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "extract" }] }],
        responseFormat: { type: "json", name: "missing.key" },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MissingMockResponseError);
    expect((caught as MissingMockResponseError).schemaName).toBe("missing.key");
  });
});
