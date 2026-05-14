import crypto from "crypto";
import { scrapeStore } from "./scrape-store.js";
import type {
  ResolveScrapesResponse,
  ScrapeRef,
  ScrapeLogEntry,
  ScrapeStatus,
  ScrapeUrlState,
  ScrapeVersion,
} from "./types.js";
import { getDomainForUrl, urlStateId, versionId } from "./url.js";
import { getScraperForUrl } from "./scrapers/index.js";

const DEFAULT_TTL_MS =
  Number(process.env.SCRAPE_CACHE_TTL_DAYS ?? 14) * 24 * 60 * 60 * 1000;
const activeScrapes = new Map<string, Promise<void>>();
type ScrapeLog = ((
  step: string,
  message: string,
  data?: Record<string, unknown>,
) => void) & { entries: ScrapeLogEntry[] };

export async function resolveScrapes(
  urls: string[],
): Promise<ResolveScrapesResponse> {
  const resources: Record<string, ScrapeRef> = {};
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

  await Promise.all(
    uniqueUrls.map(async (url) => {
      resources[url] = await resolveSingleScrape(url);
    }),
  );

  return { resources };
}

export async function resolveSingleScrape(url: string): Promise<ScrapeRef> {
  const log = createScrapeLog(url);
  log("resolve.start", "Resolve requested.", { url });
  const domain = getDomainForUrl(url);
  if (!domain) {
    log("resolve.invalid_url", "URL could not be parsed.");
    return { type: "scrape_ref", url, status: "failed", message: "Invalid URL" };
  }
  log("resolve.domain", "Parsed URL domain.", { domain });

  const domainRule = await scrapeStore.getDomainRule(domain);
  if (!domainRule?.allowed) {
    log("resolve.blocked", "Domain is not allowed for scraping.", { domain });
    return {
      type: "scrape_ref",
      url,
      status: "blocked",
      message: "Domain is not allowed for scraping",
    };
  }
  log("resolve.allowed", "Domain is allowed for scraping.", { domain });

  const state = await scrapeStore.getUrlState(url, domain);
  log("resolve.cache", "Checked stored scrape state.", {
    status: state?.status ?? "missing",
    ttlExpiresAt: state?.ttlExpiresAt,
    tokenPresent: Boolean(state?.token),
  });
  if (state && shouldReturnExistingState(state)) {
    log("resolve.return_existing", "Returning existing scrape state.", {
      status: state.status,
    });
    return refFromState(state);
  }

  const pendingState = await markPending(url, domain, state, false, log.entries);
  startScrapeIfNeeded(url, domain, log.entries);
  return refFromState(pendingState);
}

export async function retryScrape(url: string): Promise<ScrapeRef> {
  const log = createScrapeLog(url);
  log("retry.start", "Admin retry requested.", { url });
  const domain = getDomainForUrl(url);
  if (!domain) {
    log("retry.invalid_url", "URL could not be parsed.");
    return { type: "scrape_ref", url, status: "failed", message: "Invalid URL" };
  }
  log("retry.domain", "Parsed URL domain.", { domain });

  const domainRule = await scrapeStore.getDomainRule(domain);
  if (!domainRule?.allowed) {
    log("retry.blocked", "Domain is not allowed for scraping.", { domain });
    return {
      type: "scrape_ref",
      url,
      status: "blocked",
      message: "Domain is not allowed for scraping",
    };
  }
  log("retry.allowed", "Domain is allowed for scraping.", { domain });

  const current = await scrapeStore.getUrlState(url, domain);
  log("retry.cache", "Checked stored scrape state before retry.", {
    status: current?.status ?? "missing",
    error: current?.error,
  });
  const pendingState = await markPending(url, domain, current, true, log.entries);
  startScrapeIfNeeded(url, domain, log.entries);
  return refFromState(pendingState);
}

export async function resolveTokenText(token: string): Promise<string | null> {
  const version = await scrapeStore.getVersionByToken(token);
  return version?.text ?? null;
}

export async function upsertDomainRule(
  domain: string,
  allowed: boolean,
  notes?: string,
) {
  const normalizedDomain = domain.toLowerCase();
  return scrapeStore.upsertDomainRule({
    id: `domain:${normalizedDomain}`,
    type: "domain_rule",
    domain: normalizedDomain,
    allowed,
    notes,
    updatedAt: Date.now(),
  });
}

export async function applyManualEdit(url: string, text: string) {
  const domain = getDomainForUrl(url);
  if (!domain) throw new Error("Invalid URL");

  const current = await scrapeStore.getUrlState(url, domain);
  const token = buildToken(domain, url, text);
  const version: ScrapeVersion = {
    id: versionId(token),
    type: "scrape_version",
    domain,
    url,
    token,
    source: "manual",
    text,
    previousToken: current?.token,
    createdAt: Date.now(),
    infiniteTtl: true,
  };

  await scrapeStore.createVersion(version);
  const state: ScrapeUrlState = {
    id: urlStateId(url),
    type: "url_state",
    domain,
    url,
    status: "ready",
    token,
    requestedAt: current?.requestedAt ?? Date.now(),
    lastFetchedAt: current?.lastFetchedAt,
    scrapeUpdatedAt: Date.now(),
  };
  return scrapeStore.upsertUrlState(state);
}

function shouldReturnExistingState(state: ScrapeUrlState): boolean {
  if (state.status === "pending") return true;
  if (state.status === "failed" || state.status === "blocked") return true;
  if (state.status !== "ready" || !state.token) return false;
  if (!state.ttlExpiresAt) return true;
  return state.ttlExpiresAt > Date.now();
}

function refFromState(state: ScrapeUrlState): ScrapeRef {
  return {
    type: "scrape_ref",
    url: state.url,
    status: state.status,
    token: state.token,
    message: state.error,
  };
}

async function markPending(
  url: string,
  domain: string,
  current?: ScrapeUrlState,
  forceNewAttempt = false,
  log: ScrapeLogEntry[] = [],
): Promise<ScrapeUrlState> {
  const now = Date.now();
  log.push({
    at: now,
    step: "state.pending",
    message: "Stored pending scrape state.",
    data: { forceNewAttempt },
  });
  const pending: ScrapeUrlState = {
    id: urlStateId(url),
    type: "url_state",
    domain,
    url,
    status: "pending",
    token: current?.token,
    requestedAt: now,
    lastFetchedAt: current?.lastFetchedAt,
    ttlExpiresAt: current?.ttlExpiresAt,
    scrapeStartedAt:
      !forceNewAttempt && current?.status === "pending"
        ? current.scrapeStartedAt
        : now,
    scrapeUpdatedAt: now,
    log,
  };
  return scrapeStore.upsertUrlState(pending);
}

function startScrapeIfNeeded(
  url: string,
  domain: string,
  initialLog: ScrapeLogEntry[] = [],
): void {
  if (activeScrapes.has(url)) {
    console.info("[scrape] async scrape already active", { url, domain });
    return;
  }

  const promise = scrape(url, domain, initialLog).finally(() =>
    activeScrapes.delete(url),
  );
  activeScrapes.set(url, promise);
}

async function scrape(
  url: string,
  domain: string,
  initialLog: ScrapeLogEntry[] = [],
): Promise<void> {
  const startedAt = Date.now();
  const log = createScrapeLog(url, initialLog);
  log("scrape.start", "Async scrape started.", { domain });

  try {
    const scraper = getScraperForUrl(url);
    log("scrape.scraper", "Selected scraper module.", { scraper: scraper.name });
    const result = await scraper.scrape(url, log);
    if (!result.text.trim()) {
      throw new Error("Scrape produced no text");
    }
    log("scrape.validate", "Scrape produced non-empty text.", {
      textLength: result.text.length,
      rawTextLength: result.rawText?.length,
    });

    const token = buildToken(domain, url, result.text);
    const version: ScrapeVersion = {
      id: versionId(token),
      type: "scrape_version",
      domain,
      url,
      token,
      source: "auto",
      text: result.text,
      rawText: result.rawText,
      createdAt: Date.now(),
    };
    log("state.version", "Storing scrape content version.", {
      token,
      source: version.source,
    });
    await scrapeStore.createVersion(version);
    log("state.ready", "Storing ready scrape state.", {
      ttlExpiresAt: startedAt + DEFAULT_TTL_MS,
    });
    await scrapeStore.upsertUrlState({
      id: urlStateId(url),
      type: "url_state",
      domain,
      url,
      status: "ready",
      token,
      requestedAt: startedAt,
      lastFetchedAt: Date.now(),
      ttlExpiresAt: Date.now() + DEFAULT_TTL_MS,
      scrapeStartedAt: startedAt,
      scrapeUpdatedAt: Date.now(),
      log: log.entries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("scrape.failed", "Scrape failed.", { error: message });
    await scrapeStore.upsertUrlState({
      id: urlStateId(url),
      type: "url_state",
      domain,
      url,
      status: "failed",
      error: message,
      requestedAt: startedAt,
      scrapeStartedAt: startedAt,
      scrapeUpdatedAt: Date.now(),
      log: log.entries,
    });
  }
}

function createScrapeLog(
  url: string,
  existing: ScrapeLogEntry[] = [],
): ScrapeLog {
  const entries = [...existing];
  const logger = ((
    step: string,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    const entry = { at: Date.now(), step, message, data };
    entries.push(entry);
    console.info("[scrape]", { url, step, message, ...(data ?? {}) });
  }) as ScrapeLog;
  logger.entries = entries;
  return logger;
}

function buildToken(domain: string, url: string, text: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${url}\n${text}`)
    .digest("hex");
  return `sha256:${domain}:${hash}`;
}
