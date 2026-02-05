/*
JS QUICKSTART: https://learn.microsoft.com/en-us/azure/cosmos-db/quickstart-nodejs?pivots=programming-language-js
*/

import { CosmosClient } from "@azure/cosmos";
import { MODEL_CHOICE } from "./constants.js";
import crypto from "crypto";

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_MASTER_KEY;

const client = new CosmosClient({ endpoint, key });
const databaseId = "jupytutor";
const containerId = "Container1";

// ---- Schema definition ----
// "required: false" means the field can be omitted when writing.
export const JUPYTUTOR_INTERACTION_SCHEMA = {
  id: { type: "string", required: true }, // original DB item id
  model_used: { type: "string", required: true }, // e.g. "gpt-5-nano"
  course_id: { type: "string", required: true }, // maps to textbook
  assignment_id: { type: "string", required: true },

  // str | list[Object]
  context_without_textbook: {
    type: ["string", "array"],
    itemType: "object",
    required: true,
  },

  student_request: { type: "string", required: true },

  // str | None
  response_with_textbook: {
    type: ["string", "null"],
    required: false, // may be omitted or null → needs regeneration
  },
  response_without_textbook: {
    type: ["string", "null"],
    required: false, // may be omitted or null → needs regeneration
  },

  timestamp: { type: "number", required: true },

  // irreversible crypto-secure hash for student-level evaluation
  student_id: { type: "string", required: true },
};

// ---- pk / hk / uk mapping ----
// We keep human-readable names in the model, but map them here
// so container definitions and queries can use them consistently.
export const JUPYTUTOR_INTERACTION_KEYS = {
  // partition key (Cosmos: partitionKey.paths[0] === "/student_id")
  pk: "student_id",

  // hierarchical key (not used now, have to update container settings to use)
  hk: null, //"course_id",

  // unique key (not used now, have to update container settings to use)
  uk: null, // "id" should already be enforced within partitions
};

// ---- Simple validator for the schema above ----
function validateAgainstSchema(schema, data, { allowPartial = false } = {}) {
  const errors = [];

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
        `Field '${field}' has type '${jsType}', expected one of ${allowedTypes.join(
          ", ",
        )}`,
      );
    }

    if (jsType === "array" && rules.itemType) {
      for (const [idx, item] of value.entries()) {
        if (typeof item !== rules.itemType) {
          errors.push(
            `Field '${field}'[${idx}] has type '${typeof item}', expected '${rules.itemType}'`,
          );
        }
      }
    }
  }

  if (errors.length) {
    const error = new Error(`Schema validation failed: ${errors.join("; ")}`);
    error.details = errors;
    throw error;
  }
}

// ---- Standard Cosmos collection wrapper for this model ----
export class JupytutorInteractionStore {
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

  get container() {
    return this.client.database(this.databaseId).container(this.containerId);
  }

  /**
   * Validate a full interaction object.
   * allowPartial=true lets you validate only the fields you provide
   * (for PATCH / partial updates).
   */
  validate(interaction, { allowPartial = false } = {}) {
    validateAgainstSchema(this.schema, interaction, { allowPartial });
  }

  /**
   * Upsert a JupytutorInteraction.
   * Ensures the partition key field is present and types are valid.
   */
  async upsert(interaction) {
    const { pk } = this.interactionKeys;
    if (!interaction[pk]) {
      throw new Error(
        `Partition key field '${pk}' must be present on interaction`,
      );
    }

    this.validate(interaction, { allowPartial: false });

    const { resource } = await this.container.items.upsert(interaction, {
      partitionKey: interaction[pk],
    });
    return resource;
  }

  /**
   * Read by id + partition key.
   */
  async readById(id, partitionKeyValue) {
    const item = this.container.item(id, partitionKeyValue);
    const { resource } = await item.read();
    return resource;
  }
}

// Example: export a ready-to-use store instance
export const jupytutorInteractionStore = new JupytutorInteractionStore();

const HMAC = process.env.HMAC_KEY;
/**
 * Generates a secure, searchable pseudo-anonymous ID.
 * @param {string} rawIdentifier - e.g., "kevin.gillespie"
 * @param {string} secretKey - A high-entropy key stored in your environment/KMS.
 * @returns {string} - A hex-encoded pseudonym.
 */
function generatePseudoID(rawIdentifier, secretKey) {
  if (!secretKey || secretKey.length < 32) {
    throw new Error("Secret key must be at least 32 characters long.");
  }
  return crypto
    .createHmac("sha256", secretKey)
    .update(rawIdentifier.trim().toLowerCase())
    .digest("hex");
}

/**
 * To be called upon completion of the streamed results.
 */
export const logResponse = ({ username, userMessage, response, messages }) => {
  const timestamp = Date.now();
  const course_id = "data8"; // TODO UPDATE!
  const assignment_id = ""; // TODO UPDATE!
  const _middleID = assignment_id != "" ? "--" + assignment_id : "";
  const id = `${course_id}${_middleID}--${timestamp}`;

  let student_id = "UNIDENTIFIED"; // default if name not sent, can still collect!
  if (username) student_id = generatePseudoID(username, HMAC);

  const interaction = {
    id, // item id
    student_id, // pk
    course_id,
    assignment_id,
    timestamp,
    student_request: userMessage,
    response_with_textbook: response,
    model_used: MODEL_CHOICE,
    context_without_textbook: messages.slice(0, messages.length - 2),
  };
  // TODO
  jupytutorInteractionStore.upsert(interaction).catch((err) => {
    console.log("Upload failed:", err);
  });
};
