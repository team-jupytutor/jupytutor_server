export type ScrapeStatus = "ready" | "pending" | "blocked" | "failed";

export type ScrapeRef = {
  type: "scrape_ref";
  url: string;
  status: ScrapeStatus;
  token?: string;
  message?: string;
};

export type ScrapeDomainRule = {
  id: string;
  type: "domain_rule";
  domain: string;
  allowed: boolean;
  notes?: string;
  updatedAt: number;
};

export type ScrapeUrlState = {
  id: string;
  type: "url_state";
  domain: string;
  url: string;
  status: ScrapeStatus;
  token?: string;
  error?: string;
  requestedAt: number;
  lastFetchedAt?: number;
  ttlExpiresAt?: number;
  scrapeStartedAt?: number;
  scrapeUpdatedAt?: number;
  log?: ScrapeLogEntry[];
};

export type ScrapeLogEntry = {
  at: number;
  step: string;
  message: string;
  data?: Record<string, unknown>;
};

export type ScrapeVersion = {
  id: string;
  type: "scrape_version";
  domain: string;
  url: string;
  token: string;
  source: "auto" | "manual";
  text: string;
  rawText?: string;
  sourceUrl?: string;
  contentType?: string;
  extractionMode?: string;
  previousToken?: string;
  createdAt: number;
  infiniteTtl?: boolean;
};

export type ScrapeDocument =
  | ScrapeDomainRule
  | ScrapeUrlState
  | ScrapeVersion;

export type ResolveScrapesRequest = {
  urls: string[];
};

export type ResolveScrapesResponse = {
  resources: Record<string, ScrapeRef>;
};
