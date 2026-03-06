// ─── File Upload ─────────────────────────────────────────────────────

/** Multer-compatible uploaded file from multipart/form-data. */
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  /** Fallback name used by some upload middleware. */
  name?: string;
}

// ─── Chat & LLM ─────────────────────────────────────────────────────

/** A single piece of content within a multimodal message. */
export type MessageContentPart =
  | { type: "input_text"; text: string; noShow?: boolean }
  | { type: "input_image"; image_url: string; noShow?: boolean };

/**
 * A message exchanged between user and LLM.
 *
 * `role` is present on user/assistant turns; `type` distinguishes
 * message vs. reasoning outputs from the Responses API.
 */
export interface ChatMessage {
  role?: "user" | "assistant" | "system";
  type?: "message" | "reasoning";
  content: string | MessageContentPart[];
  noShow?: boolean;
}

/** Resolved response returned by `promptTutor`. */
export interface TutorResponse {
  response: ChatMessage[];
  newChatHistory: ChatMessage[];
  promptSuggestions: string[];
  textbookContextProvided: boolean;
}

// ─── Cosmos DB ───────────────────────────────────────────────────────

/** A persisted student–tutor interaction record. */
export interface JupytutorInteraction {
  id: string;
  model_used: string;
  course_id: string;
  assignment_id: string;
  context_without_textbook: string | Record<string, unknown>[];
  student_request: string;
  textbook_context_provided: boolean;
  response_with_textbook?: string | null;
  response_without_textbook?: string | null;
  timestamp: number;
  student_id: string;
  [key: string]: unknown;
}

/** Parameters accepted by `logResponse`. */
export interface LogResponseParams {
  username?: string;
  userMessage: string;
  response: string;
  messages: ChatMessage[];
  courseID: string;
  assignmentID: string;
  textbookContextProvided: boolean;
}

/** Runtime schema field definition for Cosmos DB validation. */
export interface SchemaFieldDef {
  type: string | string[];
  itemType?: string;
  required: boolean;
}

export type SchemaDefinition = Record<string, SchemaFieldDef>;

/** Partition / hierarchical / unique key mapping for a Cosmos container. */
export interface InteractionKeys {
  pk: string;
  hk: string | null;
  uk: string | null;
}
