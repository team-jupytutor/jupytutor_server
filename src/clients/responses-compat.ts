/**
 * Responses-API-shaped model calls over either provider.
 *
 * The handlers in llm-request.ts were written against the OpenAI Responses
 * API (Azure AI Foundry). Gemini's OpenAI-compatible endpoint only offers
 * chat completions, so in GCP mode this adapter translates the request and
 * re-emits the subset of Responses stream events the handlers consume
 * (response.output_text.delta, response.output_text.done, response.completed).
 * In Azure mode it is a passthrough to client.responses.create.
 */

import type OpenAI from "openai";
import type { ChatMessage } from "../types.js";
import { isGcpProvider } from "./constants.js";

export interface ResponseParams {
  model: string;
  input: Record<string, unknown>[];
  instructions?: string;
  stream?: boolean;
}

export type ResponseStreamEvent = { type: string; delta?: string };
export type ResponseResult = { output: ChatMessage[] };

type ChatMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

export function createResponse(
  client: OpenAI,
  params: ResponseParams & { stream: true },
): Promise<AsyncIterable<ResponseStreamEvent>>;
export function createResponse(
  client: OpenAI,
  params: ResponseParams & { stream?: false },
): Promise<ResponseResult>;
export function createResponse(
  client: OpenAI,
  params: ResponseParams,
): Promise<AsyncIterable<ResponseStreamEvent> | ResponseResult>;
export async function createResponse(
  client: OpenAI,
  params: ResponseParams,
): Promise<AsyncIterable<ResponseStreamEvent> | ResponseResult> {
  if (!isGcpProvider()) {
    return client.responses.create(params as never) as unknown as Promise<
      AsyncIterable<ResponseStreamEvent> | ResponseResult
    >;
  }

  const messages = toChatMessages(params);

  if (params.stream) {
    const stream = await client.chat.completions.create({
      model: params.model,
      messages,
      stream: true,
    });
    return (async function* () {
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield { type: "response.output_text.delta", delta };
        }
      }
      yield { type: "response.output_text.done" };
      yield { type: "response.completed" };
    })();
  }

  const completion = await client.chat.completions.create({
    model: params.model,
    messages,
  });
  const content = completion.choices?.[0]?.message?.content ?? "";
  return {
    output: [{ type: "message", role: "assistant", content }],
  };
}

// ─── Responses input → chat-completions messages ────────────────────

/**
 * Gemini accepts one system message, so `instructions` and every system
 * item are merged (in order) into a single leading system message. Items
 * without a chat role (e.g. reasoning outputs kept in history) are dropped.
 */
function toChatMessages(params: ResponseParams): ChatMessageParam[] {
  const systemTexts: string[] = [];
  if (typeof params.instructions === "string") {
    systemTexts.push(params.instructions);
  }

  const turns: ChatMessageParam[] = [];
  for (const item of params.input) {
    const role = item.role;
    const content = item.content;

    if (role === "system") {
      systemTexts.push(contentToText(content));
    } else if (role === "assistant") {
      turns.push({ role: "assistant", content: contentToText(content) });
    } else if (role === "user") {
      turns.push({
        role: "user",
        content:
          typeof content === "string" ? content : contentToParts(content),
      });
    }
  }

  const system = systemTexts.filter((text) => text.trim()).join("\n\n");
  return system ? [{ role: "system", content: system }, ...turns] : turns;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text.length > 0)
    .join("\n");
}

function contentToParts(content: unknown): ChatContentPart[] {
  if (!Array.isArray(content)) return [{ type: "text", text: "" }];
  const parts: ChatContentPart[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const { type, text, image_url } = part as {
      type?: unknown;
      text?: unknown;
      image_url?: unknown;
    };
    if ((type === "input_text" || type === "text") && typeof text === "string") {
      parts.push({ type: "text", text });
    } else if (type === "input_image" && typeof image_url === "string") {
      parts.push({ type: "image_url", image_url: { url: image_url } });
    }
  }
  return parts.length > 0 ? parts : [{ type: "text", text: "[No content]" }];
}
