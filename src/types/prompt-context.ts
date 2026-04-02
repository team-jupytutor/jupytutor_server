import { z } from "zod";

const inputTextChunkSchema = z
  .object({
    type: z.literal("input_text"),
    content: z.string().optional(),
    text: z.string().optional(),
  })
  .refine(
    (value) =>
      typeof value.content === "string" || typeof value.text === "string",
    {
      message: "input_text chunk must include either `content` or `text`.",
    },
  );

const inputImageChunkSchema = z.object({
  type: z.literal("input_image"),
  image_url: z.string().min(1),
});

export const multimodalContentChunkSchema = z.union([
  inputTextChunkSchema,
  inputImageChunkSchema,
]);

export const multimodalContentSchema = z.array(multimodalContentChunkSchema);

const promptContextCellBaseSchema = z.object({
  currentContent: multimodalContentSchema,
  instructorNote: z.string().optional(),
  activeCell: z.literal(true).optional(),
});

const promptContextContentUpdatedHistoryEventSchema = z.object({
  timestamp: z.number(),
  type: z.literal("content updated"),
  content: multimodalContentSchema,
});

const promptContextChatHistoryEventSchema = z.object({
  timestamp: z.number(),
  type: z.literal("chat"),
  content: z.string(),
  sender: z.enum(["assistant", "user"]),
});

const promptContextCellRunHistoryEventSchema = z.object({
  timestamp: z.number(),
  type: z.literal("cell run"),
  hadError: z.boolean(),
  output: multimodalContentSchema,
});

const promptContextMarkdownCellSchema = promptContextCellBaseSchema.extend({
  type: z.literal("markdown"),
  history: z.array(
    z.union([
      promptContextContentUpdatedHistoryEventSchema,
      promptContextChatHistoryEventSchema,
    ]),
  ),
});

const promptContextCodeCellSchema = promptContextCellBaseSchema.extend({
  type: z.literal("code"),
  history: z.array(
    z.union([
      promptContextContentUpdatedHistoryEventSchema,
      promptContextChatHistoryEventSchema,
      promptContextCellRunHistoryEventSchema,
    ]),
  ),
});

export const promptContextCellSchema = z.union([
  promptContextMarkdownCellSchema,
  promptContextCodeCellSchema,
]);

export const promptContextSchema = z.object({
  resources: z
    .object({
      _description: z.string(),
    })
    .catchall(z.string()),
  notebook: z.object({
    overview: z.string(),
    filteredCells: z.object({
      _description: z.string(),
      cells: z.array(promptContextCellSchema),
    }),
  }),
  activeCellContext: promptContextCellSchema.nullable(),
});

export const interactionV2RequestSchema = z.object({
  promptContext: promptContextSchema,
  newMessage: multimodalContentSchema,
  stream: z.boolean().optional(),
  userId: z.string().optional(),
  jupyterhubHostname: z.string().optional(),
  notebookPath: z.string().optional(),
  courseId: z.string().optional(),
  assignmentId: z.string().optional(),
});

export type MultimodalContentChunk = z.infer<
  typeof multimodalContentChunkSchema
>;
export type MultimodalContent = z.infer<typeof multimodalContentSchema>;
export type PromptContextCell = z.infer<typeof promptContextCellSchema>;
export type PromptContext = z.infer<typeof promptContextSchema>;
export type InteractionV2Request = z.infer<typeof interactionV2RequestSchema>;
