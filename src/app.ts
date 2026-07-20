/**
 * Jupytutor API server.
 *
 * Express 5 application serving the tutoring endpoints consumed by the
 * Jupytutor Jupyter notebook extension. Handles CORS for any JupyterHub
 * origin (not tied to a specific institution's hub), multipart file uploads
 * via multer, and delegates to the student router.
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Multer (file uploads) ──────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/bmp",
      "image/webp",
      "text/plain",
      "text/markdown",
      "text/csv",
      "text/x-python",
      "application/json",
      "text/html",
      "text/css",
      "application/javascript",
      "text/typescript",
      "text/jsx",
      "text/tsx",
      "text/*",
    ];

    if (
      allowedTypes.includes(file.mimetype) ||
      file.mimetype.startsWith("text/")
    ) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not supported`));
    }
  },
});

// ─── CORS ────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Content-Length", "X-Requested-With"],
    optionsSuccessStatus: 200,
  }),
);

// ─── Body parsing ────────────────────────────────────────────────────

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Conditionally run multer for multipart/form-data requests
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    upload.any()(req, res, next);
  } else {
    next();
  }
});

// Ensure req.files is always available downstream
app.use((req: Request, _res: Response, next: NextFunction) => {
  const r = req as unknown as Record<string, unknown>;
  if (!r.files) {
    r.files = [];
  }
  next();
});

// ─── Error handling ──────────────────────────────────────────────────

app.use(
  (error: Error, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const multerMessages: Record<string, string> = {
        LIMIT_FILE_SIZE: "File too large. Maximum size is 10MB.",
        LIMIT_FILE_COUNT: "Too many files. Maximum is 5 files.",
        LIMIT_UNEXPECTED_FILE: "Unexpected file field.",
      };
      const msg =
        multerMessages[error.code as string] ?? error.message;
      res.status(400).json({ error: msg });
      return;
    }

    if (error.message?.includes("File type")) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  },
);

// ─── Routes ──────────────────────────────────────────────────────────

import studentRouter from "./routers/student.js";

app.use(studentRouter);

// ─── Start ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Jupytutor server listening on port ${PORT}`);
});
