import * as cheerio from "cheerio";
import type { PageScraper, ScrapeLogger, ScrapeResult } from "./base.js";

const USER_AGENT =
  "JupytutorScraper/1.0 (+https://github.com/kevyg03/jupytutor)";

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
    const sourceUrl = this.toSourceUrl(url);
    log?.("scraper.fetch", "Fetching JupyterBook source URL.", { sourceUrl });
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/markdown,text/plain,text/html;q=0.8,*/*;q=0.7",
      },
    });

    if (!response.ok) {
      throw new Error(
        `JupyterBook fetch failed with HTTP ${response.status} for ${sourceUrl}`,
      );
    }

    const rawText = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    log?.("scraper.fetch.complete", "Fetched JupyterBook source URL.", {
      sourceUrl,
      status: response.status,
      contentType,
      rawTextLength: rawText.length,
    });
    if (!contentType.includes("html")) {
      const text = normalizeText(rawText);
      log?.("scraper.extract", "Extracted plain text from JupyterBook source.", {
        sourceUrl,
        mode: "plain",
        textLength: text.length,
      });
      return { text, rawText };
    }

    const $ = cheerio.load(rawText);
    $("script, style, nav, footer, header, noscript").remove();
    const title = $("h1").first().text().trim() || $("title").text().trim();
    const body = $("main").text() || $("article").text() || $("body").text();
    const text = [title, normalizeText(body)].filter(Boolean).join("\n\n");
    log?.("scraper.extract", "Extracted text from JupyterBook HTML.", {
      sourceUrl,
      mode: "html",
      title,
      textLength: text.length,
    });
    return { text, rawText };
  }

  private toSourceUrl(url: string): string {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith(".md")) return url;

    const sourcePath = parsed.pathname
      .replace(/\/index\.html$/, ".md")
      .replace(/\.html$/, ".md");

    parsed.pathname = sourcePath.startsWith("/_sources/")
      ? sourcePath
      : `/_sources${sourcePath}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
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
