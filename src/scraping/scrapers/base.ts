export type ScrapeResult = {
  text: string;
  rawText?: string;
  sourceUrl?: string;
  contentType?: string;
  extractionMode?: string;
};

export type ScrapeLogger = (
  step: string,
  message: string,
  data?: Record<string, unknown>,
) => void;

export interface PageScraper {
  name: string;
  canScrape(url: string): boolean;
  scrape(url: string, log?: ScrapeLogger): Promise<ScrapeResult>;
}
