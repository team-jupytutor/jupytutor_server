import type {
  FetchedSource,
  SourceResolverContext,
  SourceResolverPlugin,
  SourceResolverResult,
} from "./base.js";
import { normalizeText } from "./text.js";

export class NotebookSourceResolver implements SourceResolverPlugin {
  name = "notebook-source";

  resolveFetched(
    fetched: FetchedSource,
    _context: SourceResolverContext,
  ): SourceResolverResult | null {
    if (!fetched.url.endsWith(".ipynb") && !fetched.contentType.includes("json")) {
      return null;
    }

    const text = extractNotebookText(fetched.text);
    return {
      type: "done",
      url: fetched.url,
      text,
      rawText: fetched.text,
      mode: "ipynb",
      data: { textLength: text.length },
    };
  }
}

function extractNotebookText(rawText: string): string {
  const notebook = JSON.parse(rawText) as {
    cells?: Array<{
      cell_type?: string;
      source?: string | string[];
    }>;
  };
  const chunks = (notebook.cells ?? [])
    .map((cell) => {
      const source = Array.isArray(cell.source)
        ? cell.source.join("")
        : cell.source ?? "";
      if (!source.trim()) return "";
      return cell.cell_type ? `# ${cell.cell_type}\n${source}` : source;
    })
    .filter(Boolean);

  return normalizeText(chunks.join("\n\n"));
}
