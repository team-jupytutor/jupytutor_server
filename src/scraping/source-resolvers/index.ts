import type {
  FetchedSource,
  SourceResolverContext,
  SourceResolverPlugin,
  SourceResolverResult,
} from "./base.js";
import { GithubRawResolver } from "./github-raw.js";
import { HtmlRedirectResolver } from "./html-redirect.js";
import { JupyterBookEditLinkResolver } from "./jupyterbook-edit-link.js";
import { NotebookSourceResolver } from "./notebook-source.js";
import { PlainSourceResolver } from "./plain-source.js";
import { fetchWithTimeout } from "../fetch.js";

const USER_AGENT =
  "JupytutorScraper/1.0 (+https://github.com/kevyg03/jupytutor)";

const resolverPlugins: SourceResolverPlugin[] = [
  new GithubRawResolver(),
  new HtmlRedirectResolver(),
  new JupyterBookEditLinkResolver(),
  new GithubRawResolver(),
  new NotebookSourceResolver(),
  new PlainSourceResolver(),
];

export async function resolveScrapeSource(
  startUrl: string,
  context: SourceResolverContext,
): Promise<FetchedSource> {
  const seen = new Set<string>();
  let currentUrl = startUrl;
  let lastFetched: FetchedSource | null = null;

  for (let hop = 0; hop < 10; hop += 1) {
    if (seen.has(currentUrl)) {
      context.log?.("resolver.loop", "Resolver saw the same URL twice.", {
        url: currentUrl,
        hop,
      });
      if (lastFetched) return lastFetched;
      throw new Error(`Source resolver looped before fetching ${currentUrl}`);
    }
    seen.add(currentUrl);

    const urlResolution = runUrlResolvers(currentUrl, context);
    if (urlResolution?.type === "continue") {
      context.log?.("resolver.plugin", urlResolution.reason, {
        plugin: urlResolution.data?.plugin,
        from: currentUrl,
        to: urlResolution.url,
        ...urlResolution.data,
      });
      currentUrl = urlResolution.url;
      continue;
    }

    const fetched = await fetchSource(currentUrl, context, hop);
    lastFetched = fetched;

    const fetchedResolution = runFetchedResolvers(fetched, context);
    if (!fetchedResolution) return fetched;

    if (fetchedResolution.type === "done") {
      context.log?.("resolver.done", "Resolver produced final scrape text.", {
        plugin: fetchedResolution.data?.plugin,
        url: fetchedResolution.url,
        mode: fetchedResolution.mode,
        ...fetchedResolution.data,
      });
      return {
        requestedUrl: fetched.requestedUrl,
        url: fetchedResolution.url,
        status: fetched.status,
        contentType: fetched.contentType,
        text: fetchedResolution.text,
        rawText: fetchedResolution.rawText,
        mode: fetchedResolution.mode,
      };
    }

    context.log?.("resolver.plugin", fetchedResolution.reason, {
      plugin: fetchedResolution.data?.plugin,
      from: fetched.url,
      to: fetchedResolution.url,
      ...fetchedResolution.data,
    });
    currentUrl = fetchedResolution.url;
  }

  if (lastFetched) {
    context.log?.("resolver.max_hops", "Resolver hit max hops; using last fetch.", {
      url: lastFetched.url,
    });
    return lastFetched;
  }

  throw new Error(`Source resolver exceeded max hops for ${startUrl}`);
}

export function resolveFetchedText(
  fetched: FetchedSource,
  context: SourceResolverContext,
): SourceResolverResult | null {
  const result = runFetchedResolvers(fetched, context);
  return result?.type === "done" ? result : null;
}

function runUrlResolvers(
  url: string,
  context: SourceResolverContext,
): SourceResolverResult | null {
  for (const plugin of resolverPlugins) {
    const result = plugin.resolveUrl?.(url, context);
    if (result) {
      result.data = { plugin: plugin.name, ...result.data };
      return result;
    }
  }
  return null;
}

function runFetchedResolvers(
  fetched: FetchedSource,
  context: SourceResolverContext,
): SourceResolverResult | null {
  for (const plugin of resolverPlugins) {
    const result = plugin.resolveFetched?.(fetched, context);
    if (result) {
      result.data = { plugin: plugin.name, ...result.data };
      return result;
    }
  }
  return null;
}

async function fetchSource(
  url: string,
  context: SourceResolverContext,
  hop: number,
): Promise<FetchedSource> {
  context.log?.("resolver.fetch", "Fetching resolver URL.", { url, hop });
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "application/json,text/markdown,text/plain,text/html,application/xhtml+xml;q=0.9,*/*;q=0.7",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Resolver fetch failed with HTTP ${response.status} for ${url}`);
  }

  const text = await response.text();
  const fetched = {
    requestedUrl: url,
    url: response.url || url,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text,
  };
  context.log?.("resolver.fetch.complete", "Fetched resolver URL.", {
    requestedUrl: fetched.requestedUrl,
    responseUrl: fetched.url,
    status: fetched.status,
    contentType: fetched.contentType,
    textLength: text.length,
  });

  return fetched;
}
