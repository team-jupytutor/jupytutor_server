import * as cheerio from "cheerio";
import type {
  FetchedSource,
  SourceResolverContext,
  SourceResolverPlugin,
  SourceResolverResult,
} from "./base.js";

export class JupyterBookEditLinkResolver implements SourceResolverPlugin {
  name = "jupyterbook-edit-link";

  resolveFetched(
    fetched: FetchedSource,
    _context: SourceResolverContext,
  ): SourceResolverResult | null {
    if (!fetched.contentType.includes("html")) return null;

    const $ = cheerio.load(fetched.text);
    const editHref =
      $("a[title='Edit This Page']").attr("href") ||
      $("a[aria-label='Edit This Page']").attr("href") ||
      $("a[href*='github.com'][href*='/edit/']").first().attr("href") ||
      $("a[href*='github.com'][href*='/blob/']").first().attr("href");

    if (!editHref) return null;

    const editUrl = new URL(editHref, fetched.url).toString();
    return {
      type: "continue",
      url: editUrl,
      reason: "Follow JupyterBook edit/source link.",
      data: { pageUrl: fetched.url, editUrl },
    };
  }
}
