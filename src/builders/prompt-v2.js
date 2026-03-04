import fs from "fs";

const promptContextTemplate = fs.readFileSync(
  "src/prompts/prompt_context_template.md",
  "utf8",
);

const toOpenAIInputChunk = (chunk) => {
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
};

export const normalizeMultimodalContent = (chunks) => {
  if (!Array.isArray(chunks)) {
    return [];
  }

  return chunks
    .map(toOpenAIInputChunk)
    .filter(
      (chunk) =>
        chunk !== null &&
        (chunk.type !== "input_text" || chunk.text.trim().length > 0),
    );
};

const ensureTextChunkSeparation = (text) => {
  if (text.endsWith("\n\n")) {
    return text;
  }
  if (text.endsWith("\n")) {
    return `${text}\n`;
  }
  return `${text}\n\n`;
};

const asTextChunk = (text) => ({
  type: "input_text",
  text: ensureTextChunkSeparation(text),
});

const pushText = (chunks, text) => {
  if (typeof text !== "string") {
    return;
  }

  if (text.trim().length === 0) {
    return;
  }

  chunks.push(asTextChunk(text));
};

const renderTemplateWithChunks = (template, values) => {
  const chunks = [];
  const pattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let lastIndex = 0;
  let match;

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

  const trailingStatic = template.slice(lastIndex);
  pushText(chunks, trailingStatic);

  return chunks;
};

const multimodalToChunks = (multimodalContent) => {
  const normalized = normalizeMultimodalContent(multimodalContent);
  if (normalized.length === 0) {
    return [asTextChunk("[No content]")];
  }

  return normalized.map((item) =>
    item.type === "input_text"
      ? asTextChunk(item.text)
      : { type: "input_image", image_url: item.image_url },
  );
};

const renderCellContextChunks = (cell, sectionTitle) => {
  const chunks = [];
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

    if (event.type === "cell run") {
      pushText(
        chunks,
        `${eventLabel}: cell run at ${event.timestamp}; hadError=${event.hadError}`,
      );
      pushText(chunks, "Cell run output:");
      chunks.push(...multimodalToChunks(event.output));
    }
  });

  return chunks;
};

const renderResourcesMarkdown = (resources) => {
  const entries = Object.entries(resources ?? {}).filter(
    ([key]) => key !== "_description",
  );
  if (entries.length === 0) {
    return "[none]";
  }

  return entries
    .map(([url, value]) => `### Source: ${url}\n\n${value}`)
    .join("\n\n");
};

const renderFilteredCellsChunks = (filteredCells) => {
  if (!Array.isArray(filteredCells) || filteredCells.length === 0) {
    return [asTextChunk("[none]")];
  }

  const chunks = [];
  filteredCells.forEach((cell, index) => {
    chunks.push(...renderCellContextChunks(cell, `Filtered Cell ${index + 1}`));
  });

  return chunks;
};

const renderActiveCellChunks = (activeCell) => {
  if (!activeCell) {
    return [asTextChunk("[none]")];
  }

  return renderCellContextChunks(activeCell, "Active Cell Full Context");
};

export const buildPromptContextAsMultimodalContent = (promptContext) => {
  const filteredCells = promptContext?.notebook?.filteredCells?.cells ?? [];
  const activeCell = promptContext?.activeCellContext;

  return renderTemplateWithChunks(promptContextTemplate, {
    resources_description: promptContext?.resources?._description || "[none]",
    resources_body: renderResourcesMarkdown(promptContext?.resources),
    notebook_overview: promptContext?.notebook?.overview || "[none]",
    filtered_cells_description:
      promptContext?.notebook?.filteredCells?._description || "[none]",
    filtered_cells_body: renderFilteredCellsChunks(filteredCells),
    active_cell_body: renderActiveCellChunks(activeCell),
  });
};

export const multimodalContentToDisplayText = (content) => {
  const normalized = normalizeMultimodalContent(content);
  const displayParts = normalized.map((item) =>
    item.type === "input_text" ? item.text : "[Image]",
  );
  return displayParts.join("\n").trim();
};
