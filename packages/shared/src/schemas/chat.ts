import { z } from "zod";

export const ChatThreadSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    updatedAt: z.number().int(),
  })
  .strict();

export type ChatThread = z.infer<typeof ChatThreadSchema>;

export const ChatThreadListResponseSchema = z
  .object({
    threads: ChatThreadSchema.array(),
    nextCursor: z.number().int().nullable(),
  })
  .strict();

export type ChatThreadListResponse = z.infer<typeof ChatThreadListResponseSchema>;

export const ChatThreadCreatedResponseSchema = z.object({ id: z.string().uuid() }).strict();

export type ChatThreadCreatedResponse = z.infer<typeof ChatThreadCreatedResponseSchema>;

export const ChatMessageRecordSchema = z
  .object({
    id: z.string(),
    role: z.string(),
    parts: z.array(z.record(z.string(), z.unknown())),
  })
  .strict();

export type ChatMessageRecord = z.infer<typeof ChatMessageRecordSchema>;

export const ChatThreadDetailResponseSchema = z
  .object({
    threadId: z.string().uuid(),
    messages: ChatMessageRecordSchema.array(),
  })
  .strict();

export type ChatThreadDetailResponse = z.infer<typeof ChatThreadDetailResponseSchema>;
