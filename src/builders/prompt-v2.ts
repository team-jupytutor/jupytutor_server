import fs from "fs";
import type { MessageContentPart } from "../types.js";
import type {
  MultimodalContent,
  MultimodalContentChunk,
  PromptContext,
  PromptContextCell,
} from "../types/prompt-context.js";

const promptContextTemplate = fs.readFileSync(
  "src/prompts/prompt_context_template.md",
  "utf8",
);

type NormalizedChunk = MessageContentPart;

function toOpenAIInputChunk(
  chunk: MultimodalContentChunk | null | undefined,
): NormalizedChunk | null {
  if (!chunk || typeof chunk !== "object") {
    return null;
  }

  if (chunk.type === "input_text") {
    const text =
      typeof chunk.text === "string"
        ? chunk.text
        : typeof chunk.content === "string"
          ? chunk.content
          : "";
    return { type: "input_text", text };
  }

  if (chunk.type === "input_image" && typeof chunk.image_url === "string") {
    return { type: "input_image", image_url: chunk.image_url };
  }

  return null;
}

export function normalizeMultimodalContent(
  chunks: MultimodalContent | null | undefined,
): MessageContentPart[] {
  if (!Array.isArray(chunks)) {
    return [];
  }

  return chunks
    .map(toOpenAIInputChunk)
    .filter(
      (chunk): chunk is MessageContentPart =>
        chunk !== null &&
        (chunk.type !== "input_text" || chunk.text.trim().length > 0),
    );
}

function ensureTextChunkSeparation(text: string): string {
  if (text.endsWith("\n\n")) {
    return text;
  }
  if (text.endsWith("\n")) {
    return `${text}\n`;
  }
  return `${text}\n\n`;
}

function asTextChunk(
  text: string,
): Extract<MessageContentPart, { type: "input_text" }> {
  return {
    type: "input_text",
    text: ensureTextChunkSeparation(text),
  };
}

function pushText(
  chunks: MessageContentPart[],
  text: string | undefined,
): void {
  if (typeof text !== "string" || text.trim().length === 0) {
    return;
  }

  chunks.push(asTextChunk(text));
}

function renderTemplateWithChunks(
  template: string,
  values: Record<string, string | MessageContentPart[]>,
): MessageContentPart[] {
  const chunks: MessageContentPart[] = [];
  const pattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    const [fullMatch, key] = match;
    const staticPart = template.slice(lastIndex, match.index);
    pushText(chunks, staticPart);

    const value = values[key];
    if (Array.isArray(value)) {
      chunks.push(...value);
    } else if (typeof value === "string") {
      pushText(chunks, value);
    }

    lastIndex = match.index + fullMatch.length;
  }

  pushText(chunks, template.slice(lastIndex));
  return chunks;
}

function multimodalToChunks(
  multimodalContent: MultimodalContent,
): MessageContentPart[] {
  const normalized = normalizeMultimodalContent(multimodalContent);
  if (normalized.length === 0) {
    return [asTextChunk("[No content]")];
  }

  return normalized.map((item) =>
    item.type === "input_text"
      ? asTextChunk(item.text)
      : { type: "input_image", image_url: item.image_url },
  );
}

function renderCellContextChunks(
  cell: PromptContextCell,
  sectionTitle: string,
): MessageContentPart[] {
  const chunks: MessageContentPart[] = [];
  pushText(chunks, `### ${sectionTitle}`);
  pushText(chunks, `- Cell type: ${cell.type}`);

  if (cell.activeCell) {
    pushText(chunks, "- This is the active cell.");
  }

  if (
    typeof cell.instructorNote === "string" &&
    cell.instructorNote.trim().length > 0
  ) {
    pushText(chunks, `- Instructor note:\n${cell.instructorNote}`);
  }

  pushText(chunks, "#### Current Cell Content");
  chunks.push(...multimodalToChunks(cell.currentContent));

  if (!Array.isArray(cell.history) || cell.history.length === 0) {
    pushText(chunks, "#### History");
    pushText(chunks, "[none]");
    return chunks;
  }

  pushText(chunks, "#### History");
  cell.history.forEach((event, index) => {
    const eventLabel = `History ${index + 1}`;

    if (event.type === "content updated") {
      pushText(chunks, `${eventLabel}: content updated at ${event.timestamp}`);
      chunks.push(...multimodalToChunks(event.content));
      return;
    }

    if (event.type === "chat") {
      pushText(
        chunks,
        `${eventLabel}: chat from ${event.sender} at ${event.timestamp}\n${event.content}`,
      );
      return;
    }

    pushText(
      chunks,
      `${eventLabel}: cell run at ${event.timestamp}; hadError=${event.hadError}`,
    );
    pushText(chunks, "Cell run output:");
    chunks.push(...multimodalToChunks(event.output));
  });

  return chunks;
}

function renderResourcesMarkdown(
  resources: PromptContext["resources"] | undefined,
): string {
  const entries = Object.entries(resources ?? {}).filter(
    ([key]) => key !== "_description",
  );
  if (entries.length === 0) {
    return "[none]";
  }

  return entries.map(([, value]) => value).join("\n\n");
}

function renderFilteredCellsChunks(
  filteredCells: PromptContextCell[],
): MessageContentPart[] {
  if (!Array.isArray(filteredCells) || filteredCells.length === 0) {
    return [asTextChunk("[none]")];
  }

  const chunks: MessageContentPart[] = [];
  filteredCells.forEach((cell, index) => {
    chunks.push(...renderCellContextChunks(cell, `Filtered Cell ${index + 1}`));
  });

  return chunks;
}

function renderActiveCellChunks(
  activeCell: PromptContextCell | null,
): MessageContentPart[] {
  if (!activeCell) {
    return [asTextChunk("[none]")];
  }

  return renderCellContextChunks(activeCell, "Active Cell Full Context");
}

export function buildPromptContextAsMultimodalContent(
  promptContext: PromptContext,
): MessageContentPart[] {
  const filteredCells = promptContext.notebook.filteredCells.cells ?? [];
  const activeCell = promptContext.activeCellContext;

  return renderTemplateWithChunks(promptContextTemplate, {
    resources_description: promptContext.resources._description || "[none]",
    resources_body: renderResourcesMarkdown(promptContext.resources),
    notebook_overview: promptContext.notebook.overview || "[none]",
    filtered_cells_description:
      promptContext.notebook.filteredCells._description || "[none]",
    filtered_cells_body: renderFilteredCellsChunks(filteredCells),
    active_cell_body: renderActiveCellChunks(activeCell),
  });
}

function chunksToText(chunks: MessageContentPart[]): string {
  return chunks
    .map((c) => (c.type === "input_text" ? c.text : "[Image]"))
    .join("")
    .trim();
}

export function buildNotebookContextForLogging(
  promptContext: PromptContext,
): string {
  const filteredCells = promptContext.notebook.filteredCells.cells ?? [];
  const activeCell = promptContext.activeCellContext;

  const sections: string[] = [];

  sections.push(
    `## Notebook Overview\n\n${promptContext.notebook.overview || "[none]"}`,
  );

  sections.push(
    [
      "## Notebook Cells",
      promptContext.notebook.filteredCells._description || "[none]",
      chunksToText(renderFilteredCellsChunks(filteredCells)),
    ].join("\n\n"),
  );

  sections.push(
    `## Active Cell\n\n${chunksToText(renderActiveCellChunks(activeCell))}`,
  );

  return sections.join("\n\n");
}

export function multimodalContentToDisplayText(
  content: MultimodalContent,
): string {
  return normalizeMultimodalContent(content)
    .map((item) => (item.type === "input_text" ? item.text : "[Image]"))
    .join("\n")
    .trim();
}
