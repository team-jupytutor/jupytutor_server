import * as cheerio from "cheerio";
import type {
  FetchedSource,
  SourceResolverContext,
  SourceResolverPlugin,
  SourceResolverResult,
} from "./base.js";

export class HtmlRedirectResolver implements SourceResolverPlugin {
  name = "html-redirect";

  resolveFetched(
    fetched: FetchedSource,
    _context: SourceResolverContext,
  ): SourceResolverResult | null {
    if (!fetched.contentType.includes("html")) return null;

    const url = findHtmlRedirectUrl(fetched.text, fetched.url);
    if (!url || url === fetched.url) return null;

    return {
      type: "continue",
      url,
      reason: "Follow HTML meta/script redirect.",
      data: { from: fetched.url, to: url },
    };
  }
}

function findHtmlRedirectUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const refresh = $("meta[http-equiv]").filter((_index, element) => {
    return $(element).attr("http-equiv")?.toLowerCase() === "refresh";
  });
  const refreshContent = refresh.attr("content") ?? "";
  const refreshMatch = refreshContent.match(/url\s*=\s*([^;]+)/i);
  if (refreshMatch?.[1]) {
    return new URL(stripQuotes(refreshMatch[1].trim()), baseUrl).toString();
  }

  const scriptText = $("script")
    .map((_index, element) => $(element).text())
    .get()
    .join("\n");
  const scriptMatch = scriptText.match(
    /(?:window\.)?location(?:\.href|\.replace)?\s*(?:=|\()\s*["']([^"']+)["']/i,
  );
  if (scriptMatch?.[1]) {
    return new URL(scriptMatch[1], baseUrl).toString();
  }

  return null;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}
