import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
dotenv.config();

// Initialize the app instance
const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for handling formdata
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5, // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = [
      // Images
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/bmp",
      "image/webp",
      // Text files
      "text/plain",
      "text/markdown",
      "text/csv",
      // Code files
      "text/x-python",
      "application/json",
      "text/html",
      "text/css",
      "application/javascript",
      "text/typescript",
      "text/jsx",
      "text/tsx",
      // Generic text
      "text/*",
    ];

    if (
      allowedTypes.includes(file.mimetype) ||
      file.mimetype.startsWith("text/")
    ) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not supported`), false);
    }
  },
});

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "http://localhost:8888",
      "http://127.0.0.1:8888",
      "http://localhost:8889",
      "http://127.0.0.1:8889",
      "https://datahub.berkeley.edu",
    ];

    const isAllowed =
      allowedOrigins.includes(origin) ||
      origin.endsWith(".datahub.berkeley.edu");

    return isAllowed
      ? callback(null, true)
      : callback(new Error("Not allowed by CORS, with origin: " + origin));
  },
  credentials: true, // Required for credentials: 'include'
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed HTTP methods
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  exposedHeaders: ["Content-Length", "X-Requested-With"],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};
app.use(cors(corsOptions));

// Middleware
app.use(express.json({ limit: "256mb" }));
app.use(express.urlencoded({ extended: true, limit: "256mb" }));

// Handle formdata parsing for all routes
app.use((req, res, next) => {
  // Check if the request has multipart/form-data content type
  if (
    req.headers["content-type"] &&
    req.headers["content-type"].includes("multipart/form-data")
  ) {
    // Use multer for multipart/form-data requests
    upload.any()(req, res, next);
  } else {
    // For non-multipart requests, continue to next middleware
    next();
  }
});

// Ensure req.files is always available
app.use((req, res, next) => {
  if (!req.files) {
    req.files = [];
  }
  next();
});

// Error handling middleware for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 10MB." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ error: "Too many files. Maximum is 5 files." });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: "Unexpected file field." });
    }
    return res.status(400).json({ error: error.message });
  }

  if (error.message && error.message.includes("File type")) {
    return res.status(400).json({ error: error.message });
  }

  next(error);
});

// Attach the endpoints implemented in routers/
import studentRouter from "./routers/student.js";

app.use(studentRouter);

// Run the app
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
