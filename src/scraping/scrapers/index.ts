import type { PageScraper } from "./base.js";
import { JupyterBookScraper } from "./jupyterbook.js";
import { PlainPageScraper } from "./plain-page.js";

const scrapers: PageScraper[] = [new JupyterBookScraper(), new PlainPageScraper()];

export function getScraperForUrl(url: string): PageScraper {
  const scraper =
    scrapers.find((candidate) => candidate.canScrape(url)) ?? scrapers.at(-1)!;
  return scraper;
}
