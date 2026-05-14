import * as cheerio from "cheerio";
import type { PageScraper, ScrapeLogger, ScrapeResult } from "./base.js";
import { fetchWithTimeout } from "../fetch.js";

const USER_AGENT =
  "JupytutorScraper/1.0 (+https://github.com/kevyg03/jupytutor)";

export class PlainPageScraper implements PageScraper {
  name = "plain-page";

  canScrape(_url: string): boolean {
    return true;
  }

  async scrape(url: string, log?: ScrapeLogger): Promise<ScrapeResult> {
    log?.("scraper.fetch", "Fetching page URL.");
    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const rawText = await response.text();
    log?.("scraper.fetch.complete", "Fetched page URL.", {
      status: response.status,
      contentType,
      rawTextLength: rawText.length,
    });

    if (!contentType.includes("html")) {
      const text = normalizeText(rawText);
      log?.("scraper.extract", "Extracted plain text from page.", {
        mode: "plain",
        textLength: text.length,
      });
      return {
        text,
        rawText,
        sourceUrl: response.url || url,
        contentType,
        extractionMode: "plain",
      };
    }

    const $ = cheerio.load(rawText);
    $("script, style, nav, footer, header, noscript").remove();
    const title = $("title").first().text().trim();
    const mainText =
      $("main").text() ||
      $("article").text() ||
      $("[role='main']").text() ||
      $("body").text();
    const text = [title, normalizeText(mainText)].filter(Boolean).join("\n\n");
    log?.("scraper.extract", "Extracted text from page HTML.", {
      mode: "html",
      title,
      textLength: text.length,
    });

    return {
      text,
      rawText,
      sourceUrl: response.url || url,
      contentType,
      extractionMode: "html",
    };
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
