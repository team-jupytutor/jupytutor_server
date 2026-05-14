import type { ScrapeLogger } from "../scrapers/base.js";

export type FetchedSource = {
  requestedUrl: string;
  url: string;
  status: number;
  contentType: string;
  text: string;
  rawText?: string;
  mode?: string;
};

export type SourceResolverResult =
  | {
      type: "continue";
      url: string;
      reason: string;
      data?: Record<string, unknown>;
    }
  | {
      type: "done";
      url: string;
      text: string;
      rawText: string;
      mode: string;
      data?: Record<string, unknown>;
    };

export type SourceResolverContext = {
  log?: ScrapeLogger;
};

export interface SourceResolverPlugin {
  name: string;
  resolveUrl?(
    url: string,
    context: SourceResolverContext,
  ): SourceResolverResult | null;
  resolveFetched?(
    fetched: FetchedSource,
    context: SourceResolverContext,
  ): SourceResolverResult | null;
}
