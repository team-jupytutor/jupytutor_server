import type {
  FetchedSource,
  SourceResolverContext,
  SourceResolverPlugin,
  SourceResolverResult,
} from "./base.js";
import { normalizeText } from "./text.js";

export class PlainSourceResolver implements SourceResolverPlugin {
  name = "plain-source";

  resolveFetched(
    fetched: FetchedSource,
    _context: SourceResolverContext,
  ): SourceResolverResult | null {
    if (fetched.contentType.includes("html")) return null;

    const text = normalizeText(fetched.text);
    return {
      type: "done",
      url: fetched.url,
      text,
      rawText: fetched.text,
      mode: "plain",
      data: { textLength: text.length },
    };
  }
}
