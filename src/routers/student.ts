/**
 * Student interaction router.
 *
 * Exposes endpoints for the Jupytutor notebook extension
 * to submit messages and receive tutoring responses.
 */

import express from "express";
import type { Request, Response } from "express";
import { promptTutor, promptTutorV2 } from "../clients/llm-request.js";
import { logResponse } from "../clients/cosmosdb.js";
import { interactionV2RequestSchema } from "../types/prompt-context.js";
import type { ChatMessage, UploadedFile } from "../types.js";

const studentRouter = express.Router();

interface InteractionRequestBody {
  chatHistory?: ChatMessage[] | string;
  newMessage: string;
  stream?: boolean | string;
  userId?: string;
  courseId?: string;
  assignmentId?: string;
  cellType?: string;
  sourceURLs?: string[] | string;
}

function parseSourceURLs(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* not valid JSON, ignore */
    }
  }
  return [];
}

/** POST /interaction/stream — main tutoring endpoint (streaming & non-streaming). */
studentRouter.post(
  "/interaction/stream",
  async (req: Request, res: Response): Promise<void> => {
    try {
      let chatHistory: ChatMessage[] = [];

      if (req.body.chatHistory) {
        if (Array.isArray(req.body.chatHistory)) {
          chatHistory = req.body.chatHistory;
        } else if (typeof req.body.chatHistory === "string") {
          try {
            chatHistory = JSON.parse(req.body.chatHistory);
            if (!Array.isArray(chatHistory)) {
              res.status(400).json({
                error: "Invalid chatHistory format. Expected an array.",
              });
              return;
            }
          } catch {
            res.status(400).json({
              error:
                "Invalid chatHistory format. Expected valid JSON string representing an array.",
            });
            return;
          }
        } else {
          res.status(400).json({
            error:
              "Invalid chatHistory format. Expected an array or JSON string.",
          });
          return;
        }
      }

      const enableStreaming =
        req.body.stream !== false && req.body.stream !== "false";

      const files = ((req as unknown as Record<string, unknown>).files ??
        []) as UploadedFile[];

      const result = await promptTutor(
        chatHistory,
        req.body.newMessage,
        files,
        req.body.cellType,
        res,
        enableStreaming,
        parseSourceURLs(req.body.sourceURLs),
      );

      const username = req.body.userId !== "" ? req.body.userId : undefined;

      logResponse({
        username,
        userMessage: req.body.newMessage,
        response: result.response[0]?.content as string,
        messages: [...chatHistory, ...result.response],
        courseID: req.body.courseId ?? "default",
        assignmentID: req.body.assignmentId ?? "",
        textbookContextProvided: result.textbookContextProvided,
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Error in /interaction/stream endpoint:", err);

      if (!res.headersSent) {
        res.status(500).json({
          error: err.message || "Internal server error",
          details:
            process.env.NODE_ENV === "development" ? err.stack : undefined,
        });
      }
    }
  },
);

studentRouter.post("/end", (_req: Request, res: Response) => {
  res.send("Create a new user");
});

studentRouter.post(
  "/interaction/v2/stream",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parseResult = interactionV2RequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: "Invalid request body for /interaction/v2/stream.",
          details: parseResult.error.flatten(),
        });
        return;
      }

      const body = parseResult.data;
      const enableStreaming = body.stream !== false;
      const result = await promptTutorV2(
        body.promptContext,
        body.newMessage,
        res,
        enableStreaming,
      );

      const username = body.userId && body.userId !== "" ? body.userId : undefined;
      const userText = body.newMessage
        .map((chunk) =>
          chunk.type === "input_text"
            ? (chunk.text ?? chunk.content ?? "")
            : "[Image]",
        )
        .filter((part) => part.length > 0)
        .join("\n");

      logResponse({
        username,
        userMessage: userText,
        response:
          typeof result.response[0]?.content === "string"
            ? result.response[0].content
            : "",
        messages: result.newChatHistory,
        courseID: body.courseId ?? "default",
        assignmentID: body.assignmentId ?? "",
        textbookContextProvided: result.textbookContextProvided,
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Error in /interaction/v2/stream endpoint:", err);

      if (!res.headersSent) {
        res.status(500).json({
          error: err.message || "Internal server error",
          details:
            process.env.NODE_ENV === "development" ? err.stack : undefined,
        });
      }
    }
  },
);

export default studentRouter;
