/**
 * Azure Cosmos DB client for persisting student–tutor interactions.
 *
 * Provides runtime schema validation, HMAC-based pseudo-anonymous
 * student IDs, and a thin Store wrapper around the Cosmos container.
 *
 * @see https://learn.microsoft.com/en-us/azure/cosmos-db/quickstart-nodejs
 */

import { CosmosClient } from "@azure/cosmos";
import crypto from "crypto";
import { MODEL_CHOICE } from "./constants.js";
import type {
  SchemaDefinition,
  InteractionKeys,
  JupytutorInteraction,
  LogResponseParams,
} from "../types.js";

const client = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_MASTER_KEY,
});
const databaseId = "jupytutor";
const containerId = "Container1";

// ─── Schema definition ──────────────────────────────────────────────

export const JUPYTUTOR_INTERACTION_SCHEMA: SchemaDefinition = {
  id: { type: "string", required: true },
  model_used: { type: "string", required: true },
  course_id: { type: "string", required: true },
  assignment_id: { type: "string", required: true },
  context_without_textbook: {
    type: ["string", "array"],
    itemType: "object",
    required: true,
  },
  student_request: { type: "string", required: true },
  response_with_textbook: { type: ["string", "null"], required: false },
  response_without_textbook: { type: ["string", "null"], required: false },
  timestamp: { type: "number", required: true },
  student_id: { type: "string", required: true },
};

export const JUPYTUTOR_INTERACTION_KEYS: InteractionKeys = {
  pk: "student_id",
  hk: null,
  uk: null,
};

// ─── Runtime validation ─────────────────────────────────────────────

function validateAgainstSchema(
  schema: SchemaDefinition,
  data: Record<string, unknown>,
  { allowPartial = false } = {},
): void {
  const errors: string[] = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    const isPresent = value !== undefined;

    if (!isPresent) {
      if (rules.required && !allowPartial) {
        errors.push(`Missing required field '${field}'`);
      }
      continue;
    }

    const allowedTypes = Array.isArray(rules.type) ? rules.type : [rules.type];
    const jsType =
      value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

    if (!allowedTypes.includes(jsType)) {
      errors.push(
        `Field '${field}' has type '${jsType}', expected one of ${allowedTypes.join(", ")}`,
      );
    }

    if (jsType === "array" && rules.itemType) {
      for (const [idx, item] of (value as unknown[]).entries()) {
        if (typeof item !== rules.itemType) {
          errors.push(
            `Field '${field}'[${idx}] has type '${typeof item}', expected '${rules.itemType}'`,
          );
        }
      }
    }
  }

  if (errors.length) {
    const error = new Error(
      `Schema validation failed: ${errors.join("; ")}`,
    ) as Error & { details: string[] };
    error.details = errors;
    throw error;
  }
}

// ─── Store wrapper ──────────────────────────────────────────────────

export class JupytutorInteractionStore {
  private client: CosmosClient;
  private databaseId: string;
  private containerId: string;
  private schema: SchemaDefinition;
  private interactionKeys: InteractionKeys;

  constructor({
    dbId = databaseId,
    containerId: cid = containerId,
    schema = JUPYTUTOR_INTERACTION_SCHEMA,
    interactionKeys = JUPYTUTOR_INTERACTION_KEYS,
  } = {}) {
    this.client = client;
    this.databaseId = dbId;
    this.containerId = cid;
    this.schema = schema;
    this.interactionKeys = interactionKeys;
  }

  private get container() {
    return this.client.database(this.databaseId).container(this.containerId);
  }

  /** Validate a full or partial interaction against the schema. */
  validate(
    interaction: Record<string, unknown>,
    { allowPartial = false } = {},
  ): void {
    validateAgainstSchema(this.schema, interaction, { allowPartial });
  }

  /** Upsert a JupytutorInteraction (validates then writes). */
  async upsert(interaction: JupytutorInteraction) {
    const { pk } = this.interactionKeys;
    if (!interaction[pk]) {
      throw new Error(
        `Partition key field '${pk}' must be present on interaction`,
      );
    }

    this.validate(interaction as unknown as Record<string, unknown>, {
      allowPartial: false,
    });

    const { resource } = await this.container.items.upsert(interaction);
    return resource;
  }

  /** Read a single interaction by id + partition key value. */
  async readById(id: string, partitionKeyValue: string) {
    const item = this.container.item(id, partitionKeyValue);
    const { resource } = await item.read();
    return resource;
  }
}

export const jupytutorInteractionStore = new JupytutorInteractionStore();

// ─── Logging helper ─────────────────────────────────────────────────

const HMAC = process.env.HMAC_KEY;

/**
 * Generates a searchable pseudo-anonymous student ID via HMAC-SHA256.
 * The same raw identifier always maps to the same pseudonym,
 * allowing student-level aggregation without storing real names.
 */
function generatePseudoID(rawIdentifier: string, secretKey: string): string {
  if (!secretKey || secretKey.length < 32) {
    throw new Error("Secret key must be at least 32 characters long.");
  }
  return crypto
    .createHmac("sha256", secretKey)
    .update(rawIdentifier.trim().toLowerCase())
    .digest("hex");
}

/** Fire-and-forget: logs a completed interaction to Cosmos DB. */
export const logResponse = ({
  username,
  userMessage,
  response,
  messages,
  courseID: course_id,
  assignmentID: assignment_id,
}: LogResponseParams): void => {
  const timestamp = Date.now();
  const _middleID = assignment_id !== "" ? "--" + assignment_id : "";
  const id = `${course_id}${_middleID}--${timestamp}`;

  let student_id = "UNIDENTIFIED";
  if (username) student_id = generatePseudoID(username, HMAC!);

  const interaction: JupytutorInteraction = {
    id,
    student_id,
    course_id,
    assignment_id,
    timestamp,
    student_request: userMessage,
    response_with_textbook: response,
    model_used: MODEL_CHOICE,
    context_without_textbook: messages.slice(
      0,
      messages.length - 2,
    ) as unknown as Record<string, unknown>[],
  };

  jupytutorInteractionStore.upsert(interaction).catch((err) => {
    console.log("Upload failed:", err);
  });
};
