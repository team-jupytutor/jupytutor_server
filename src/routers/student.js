// routes/users.js
import express from "express";
const studentRouter = express.Router();

import { promptTutor, promptTutorV2 } from "../clients/openai.js";
import { logResponse } from "../clients/cosmosdb.js";
import { interactionV2RequestSchema } from "../types/prompt-context.js";

// Main interaction endpoint - supports both streaming and non-streaming responses
studentRouter.post("/interaction/stream", async (req, res) => {
  try {
    // Parse chatHistory - must be an array
    let chatHistory = [];
    if (req.body.chatHistory) {
      if (Array.isArray(req.body.chatHistory)) {
        chatHistory = req.body.chatHistory;
      } else if (typeof req.body.chatHistory === "string") {
        try {
          chatHistory = JSON.parse(req.body.chatHistory);
          if (!Array.isArray(chatHistory)) {
            return res.status(400).json({
              error: "Invalid chatHistory format. Expected an array.",
            });
          }
        } catch (parseError) {
          console.error("Error parsing chatHistory JSON:", parseError);
          return res.status(400).json({
            error:
              "Invalid chatHistory format. Expected valid JSON string representing an array.",
          });
        }
      } else {
        return res.status(400).json({
          error:
            "Invalid chatHistory format. Expected an array or JSON string.",
        });
      }
    }

    // Determine if streaming is enabled (default: true)
    const enableStreaming =
      req.body.stream !== false && req.body.stream !== "false";

    // Call OpenAI - promptTutor handles sending the response in both streaming and non-streaming modes
    const result = await promptTutor(
      chatHistory,
      req.body.newMessage,
      req.files || [],
      req.body.cellType,
      res, // Always pass res - promptTutor will handle it appropriately
      enableStreaming,
    );

    const username = req.body.userId != "" ? req.body.userId : undefined;
    // Log the interaction to CosmosDB
    logResponse({
      username, // Optional, can be undefined
      userMessage: req.body.newMessage,
      response: result.response[0].content,
      messages: [...chatHistory, ...result.response],
      courseID: req.body.courseId ?? "default",
      assignmentID: req.body.assignmentId ?? "",
    });
  } catch (error) {
    console.error("Error in /interaction/stream endpoint:", error);

    // Send error to client if response hasn't been sent yet
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
});

studentRouter.post("/interaction/v2/stream", async (req, res) => {
  try {
    const parseResult = interactionV2RequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request body for /interaction/v2/stream.",
        details: parseResult.error.flatten(),
      });
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
      .map((chunk) => (chunk.type === "input_text" ? chunk.text ?? chunk.content ?? "" : "[Image]"))
      .filter((part) => part.length > 0)
      .join("\n");

    logResponse({
      username,
      userMessage: userText,
      response:
        typeof result?.response?.[0]?.content === "string"
          ? result.response[0].content
          : "",
      messages: result.newChatHistory ?? [],
      courseID: body.courseId ?? "default",
      assignmentID: body.assignmentId ?? "",
    });
  } catch (error) {
    console.error("Error in /interaction/v2/stream endpoint:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
});

studentRouter.post("/end", (req, res) => {
  res.send("Create a new user");
});

export default studentRouter;
