// routes/users.js
import express from "express";
const studentRouter = express.Router();

import { promptTutor } from "../clients/openai.js";
import { logResponse } from "../clients/cosmosdb.js";

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
    const enableStreaming = req.body.stream !== false && req.body.stream !== "false";

    // Call OpenAI - promptTutor handles sending the response in both streaming and non-streaming modes
    const result = await promptTutor(
      chatHistory,
      req.body.newMessage,
      req.files || [],
      req.body.cellType,
      res, // Always pass res - promptTutor will handle it appropriately
      enableStreaming,
    );

    // Log the interaction to CosmosDB
    logResponse({
      username: req.body.username, // Optional, can be undefined
      userMessage: req.body.newMessage,
      response: result.response[0].content,
      messages: [...chatHistory, ...result.response],
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

studentRouter.post("/end", (req, res) => {
  res.send("Create a new user");
});

export default studentRouter;
