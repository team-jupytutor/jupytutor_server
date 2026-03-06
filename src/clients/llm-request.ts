/**
 * Azure OpenAI integration for the Jupytutor tutoring LLM.
 *
 * Handles prompt construction, file processing (images, code, text),
 * streaming / non-streaming responses, and chat-history management.
 */

import dotenv from "dotenv";
dotenv.config();

import { AzureOpenAI } from "openai";
import fs from "fs";
import path from "path";
import { MODEL_CHOICE } from "./constants.js";
import type { Response } from "express";
import type {
  ChatMessage,
  MessageContentPart,
  TutorResponse,
  UploadedFile,
} from "../types.js";
import resources from "../books/index.js";

export { MODEL_CHOICE };

const GPT_5_MINI_URL =
  "https://jupytutor.openai.azure.com/openai/responses?api-version=2025-04-01-preview";

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPEN_AI_KEY,
  baseURL: GPT_5_MINI_URL,
  apiVersion: "2025-04-01-preview",
  deployment: MODEL_CHOICE,
});

type ImageMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/bmp"
  | "image/webp";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
]);

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
]);

/** Detect image format from magic bytes; returns null for non-image buffers. */
function detectImageMime(buffer: Buffer): ImageMimeType | null {
  if (!buffer || buffer.length < 4) return null;

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return "image/jpeg";
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  )
    return "image/gif";
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return "image/bmp";
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return "image/webp";

  return null;
}

/** True if any message in the array contains an image content part. */
function hasImagesInMessages(messages: ChatMessage[]): boolean {
  if (!messages || !Array.isArray(messages)) return false;
  return messages.some((message) => {
    if (!message.content) return false;
    if (Array.isArray(message.content)) {
      return message.content.some(
        (item) =>
          item.type === "input_image" || (item.type as string) === "image_url",
      );
    }
    return false;
  });
}

type ProcessedContent =
  | { type: "input_image"; image_url: string; noShow: true }
  | { type: "input_text"; text: string; noShow: true };

/** Convert an uploaded file into an OpenAI-compatible content part. */
function processFile(file: UploadedFile): ProcessedContent | null {
  if (!file) return null;

  const ext = path.extname(file.originalname || file.name || "").toLowerCase();
  const filename = file.originalname || file.name || "unknown";

  if (IMAGE_EXTENSIONS.has(ext)) {
    const mime = `image/${ext.substring(1)}`;
    return {
      type: "input_image",
      image_url: `data:${mime};base64,${file.buffer.toString("base64")}`,
      noShow: true,
    };
  }

  const detectedMime = detectImageMime(file.buffer);
  if (detectedMime) {
    return {
      type: "input_image",
      image_url: `data:${detectedMime};base64,${file.buffer.toString("base64")}`,
      noShow: true,
    };
  }

  if (ext === ".py") {
    return {
      type: "input_text",
      text: `Python Code File (${filename}):\n\n${file.buffer.toString("utf-8")}`,
      noShow: true,
    };
  }

  if (ext === ".csv") {
    return {
      type: "input_text",
      text: `CSV Data File (${filename}):\n\n${file.buffer.toString("utf-8")}`,
      noShow: true,
    };
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    return {
      type: "input_text",
      text: `${ext.toUpperCase().substring(1)} File (${filename}):\n\n${file.buffer.toString("utf-8")}`,
      noShow: true,
    };
  }

  return {
    type: "input_text",
    text: `Unsupported File Type (${ext}) - ${filename}:\n\n[File content could not be processed. Please convert to a supported format.]`,
    noShow: true,
  };
}

// ─── Prompt templates (read once at startup) ────────────────────────

const graderInstructions = fs.readFileSync(
  "src/prompts/grader_prompt.txt",
  "utf8",
);
const freeResponseInstructions = fs.readFileSync(
  "src/prompts/free_prompt.txt",
  "utf8",
);
const successInstructions = fs.readFileSync(
  "src/prompts/success_prompt.txt",
  "utf8",
);

/**
 * Strip `noShow` flags from messages before sending to the API.
 * The API doesn't understand our internal `noShow` metadata.
 */
function cleanMessageForAPI(m: ChatMessage): Record<string, unknown> {
  const { noShow: _ns, content, ...rest } = m;
  const cleaned: Record<string, unknown> = { ...rest };

  if (Array.isArray(content)) {
    cleaned.content = content.map((item) => {
      if (!item || typeof item !== "object") return item;
      const { noShow: _ignore, ...cleanItem } = item;
      return cleanItem;
    });
  } else if (content !== undefined) {
    cleaned.content = content;
  }

  return cleaned;
}

export const STARTING_TEXTBOOK_CONTEXT: string = `
IMPORTANT - Response Formatting:
- Use markdown headers (## for h2, ### for h3) for ALL section titles if needed for clarity.
- Always add blank lines before and after headers
- Use proper markdown link syntax: [Link Text](URL), NOT <a> or [LINK] tags.
- Use **bold** or *italic* sparingly and only for emphasis within text (NOT for section headers)
The following input after this is an aggregation of potentially relevant resources to the assignment.
Keep in mind, some are relevant to each particular question, some are not. You should attempt to cite sources when you use the source contents in your response, formatted as Markdown links. This should function to encourage student agency and help to not reveal answers directly.
`;

/**
 * Process chat history by removing images and marking reasoning as noShow.
 * Prevents the chat history from growing unboundedly on subsequent requests.
 */
function processChatHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (message.type === "reasoning") {
      return { ...message, noShow: true };
    }

    if (typeof message.content === "string") {
      return message;
    }

    const firstText = message.content.find(
      (sub): sub is Extract<MessageContentPart, { type: "input_text" }> =>
        sub.type === "input_text",
    );

    return {
      ...message,
      content: firstText?.text ?? message.content,
    };
  });
}

/**
 * Send a message (with optional files and history) to the tutoring LLM.
 *
 * Handles both streaming (SSE-style chunked response) and non-streaming
 * modes. When streaming, writes directly to `res` and closes the stream
 * upon completion.
 */
export async function promptTutor(
  chatHistory: ChatMessage[],
  newMessage: string,
  files: UploadedFile[] = [],
  cellType: string,
  res: Response | null = null,
  stream = false,
  sourceURLs: string[] = [],
): Promise<TutorResponse> {
  const messages: ChatMessage[] = [];

  if (chatHistory?.length) {
    messages.push(...chatHistory);
  }

  const messageContent: MessageContentPart[] = [];

  if (files?.length) {
    for (const file of files) {
      const processed = processFile(file);
      if (processed) {
        messageContent.push(processed);
      }
    }
  }

  if (newMessage) {
    messageContent.push({ type: "input_text", text: newMessage });
  }

  const userMessage: ChatMessage = { role: "user", content: messageContent };

  // Avoid duplicating the latest user message if it's already present
  const lastMessage = messages[messages.length - 1];
  const lastUserText =
    lastMessage?.role === "user"
      ? Array.isArray(lastMessage.content)
        ? (lastMessage.content.find((sub) => sub.type === "input_text")?.text ??
          "")
        : typeof lastMessage.content === "string"
          ? lastMessage.content
          : ""
      : null;
  const newMessageText = typeof newMessage === "string" ? newMessage : "";

  if (
    !(
      lastUserText &&
      newMessageText &&
      lastUserText.trim() === newMessageText.trim()
    )
  ) {
    messages.push(userMessage);
  }

  // Kept for future per-content-type model routing
  const _hasImages =
    files?.some((f) => {
      const ext = path.extname(f.originalname || f.name || "").toLowerCase();
      return IMAGE_EXTENSIONS.has(ext) || detectImageMime(f.buffer) !== null;
    }) ?? hasImagesInMessages(messages);

  const model = "gpt-5-mini";
  const instructions =
    cellType === "grader"
      ? graderInstructions
      : cellType === "free_response"
        ? freeResponseInstructions
        : successInstructions;

  // ─── Textbook context (prepended to API input, never returned) ───
  const context =
    sourceURLs.length > 0
      ? resources.getFromURLs(sourceURLs)
      : "<no_source_materials>";

  // >>>>>>>>>> TEMP LOG — delete after verifying textbook context flow <<<<<<<<<<
  // console.log("\n========== [TEXTBOOK_CONTEXT] ==========");
  // console.log("[TEXTBOOK_CONTEXT] sourceURLs:", sourceURLs);
  // console.log(
  //   "[TEXTBOOK_CONTEXT] retrieved context (%d chars):\n%s",
  //   context.length,
  //   context.substring(0, 500) + (context.length > 500 ? "\n  ... (truncated)" : ""),
  // );
  // console.log("========== [/TEXTBOOK_CONTEXT] ==========\n");
  // >>>>>>>>>> END TEMP LOG <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

  const textbookContext: ChatMessage[] = [
    {
      role: "system",
      content: [{ type: "input_text", text: STARTING_TEXTBOOK_CONTEXT }],
    },
    {
      role: "system",
      content: [{ type: "input_text", text: context }],
    },
  ];

  const cleanedInput = [
    ...textbookContext.map(cleanMessageForAPI),
    ...messages.map(cleanMessageForAPI),
  ];

  if (stream && res) {
    return handleStreaming(cleanedInput, model, instructions, messages, res);
  }

  return handleNonStreaming(cleanedInput, model, instructions, messages, res);
}

// ─── Streaming response handler ─────────────────────────────────────

async function handleStreaming(
  input: Record<string, unknown>[],
  model: string,
  instructions: string,
  messages: ChatMessage[],
  res: Response,
): Promise<TutorResponse> {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const response = await client.responses.create({
    model,
    input: input as never,
    instructions,
    stream: true,
  });

  const fullOutput: ChatMessage[] = [];
  let currentMessage = "";
  let currentReasoning = "";

  for await (const event of response) {
    const ev = event as unknown as Record<string, unknown>;
    const eventType = ev.type as string;

    if (eventType === "response.output_text.delta") {
      const delta = (ev.delta as string) || "";
      currentMessage += delta;
      res.write(
        `data: ${JSON.stringify({ type: "message_delta", content: delta, role: "assistant" })}\n\n`,
      );
    } else if (eventType === "response.output_text.done") {
      if (currentMessage) {
        fullOutput.push({
          type: "message",
          role: "assistant",
          content: currentMessage,
        });
      }
    } else if (eventType === "response.reasoning.done") {
      if (currentReasoning) {
        fullOutput.push({ type: "reasoning", content: currentReasoning });
      }
    } else if (eventType === "response.done") {
      break;
    }
  }

  messages.push(...fullOutput);

  const finalResponse: TutorResponse = {
    response: fullOutput,
    newChatHistory: processChatHistory(messages),
    promptSuggestions: [],
  };

  res.write(
    `data: ${JSON.stringify({ type: "final_response", data: finalResponse })}\n\n`,
  );
  res.write("data: [DONE]\n\n");
  res.end();

  return finalResponse;
}

// ─── Non-streaming response handler ─────────────────────────────────

async function handleNonStreaming(
  input: Record<string, unknown>[],
  model: string,
  instructions: string,
  messages: ChatMessage[],
  res: Response | null,
): Promise<TutorResponse> {
  const response = await client.responses.create({
    model,
    input: input as never,
    instructions,
  });

  const output = (response as unknown as { output: ChatMessage[] }).output;
  messages.push(...output);

  const finalResponse: TutorResponse = {
    response: output,
    newChatHistory: processChatHistory(messages),
    promptSuggestions: [],
  };

  if (res) {
    res.json(finalResponse);
  }

  return finalResponse;
}
