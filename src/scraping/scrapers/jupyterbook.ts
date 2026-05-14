import * as cheerio from "cheerio";
import type { PageScraper, ScrapeLogger, ScrapeResult } from "./base.js";
import {
  resolveFetchedText,
  resolveScrapeSource,
} from "../source-resolvers/index.js";
import { normalizeText } from "../source-resolvers/text.js";

export class JupyterBookScraper implements PageScraper {
  name = "jupyterbook";

  canScrape(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.pathname.includes("/chapters/") ||
        parsed.hostname.includes("inferentialthinking.com")
      );
    } catch {
      return false;
    }
  }

  async scrape(url: string, log?: ScrapeLogger): Promise<ScrapeResult> {
    const source = await resolveScrapeSource(url, { log });

    if (source.mode) {
      log?.("scraper.extract", "Using resolver-produced source text.", {
        sourceUrl: source.url,
        mode: source.mode,
        textLength: source.text.length,
      });
      return {
        text: source.text,
        rawText: source.rawText ?? source.text,
        sourceUrl: source.url,
        contentType: source.contentType,
        extractionMode: source.mode,
      };
    }

    const resolvedText = resolveFetchedText(source, { log });
    if (resolvedText?.type === "done") {
      return {
        text: resolvedText.text,
        rawText: resolvedText.rawText,
        sourceUrl: resolvedText.url,
        extractionMode: resolvedText.mode,
      };
    }

    if (source.contentType.includes("html")) {
      return extractHtml(source.text, source.url, "html-fallback", log);
    }

    const text = normalizeText(source.text);
    log?.("scraper.extract", "Extracted plain text from resolver fallback.", {
      sourceUrl: source.url,
      mode: "plain-fallback",
      textLength: text.length,
    });
    return {
      text,
      rawText: source.text,
      sourceUrl: source.url,
      contentType: source.contentType,
      extractionMode: "plain-fallback",
    };
  }
}

function extractHtml(
  rawText: string,
  sourceUrl: string,
  mode: string,
  log?: ScrapeLogger,
): ScrapeResult {
  const $ = cheerio.load(rawText);
  $("script, style, nav, footer, header, noscript").remove();
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const body = $("main").text() || $("article").text() || $("body").text();
  const text = [title, normalizeText(body)].filter(Boolean).join("\n\n");
  log?.("scraper.extract", "Extracted text from JupyterBook HTML.", {
    sourceUrl,
    mode,
    title,
    textLength: text.length,
  });
  return { text, rawText, sourceUrl, extractionMode: mode };
}
