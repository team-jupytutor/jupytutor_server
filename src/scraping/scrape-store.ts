import "dotenv/config";
import { CosmosClient, type ItemDefinition } from "@azure/cosmos";
import fs from "fs";
import path from "path";
import type {
  ScrapeDomainRule,
  ScrapeDocument,
  ScrapeUrlState,
  ScrapeVersion,
} from "./types.js";
import { domainRuleId, urlStateId, versionId } from "./url.js";

let client: CosmosClient | null = null;
function getCosmosClient(): CosmosClient {
  if (!client) {
    client = new CosmosClient({
      endpoint: process.env.COSMOS_DB_ENDPOINT!,
      key: process.env.COSMOS_DB_MASTER_KEY,
    });
  }
  return client;
}

const databaseId = process.env.COSMOS_DB_DATABASE_NAME ?? "jupytutor";
const containerId =
  process.env.COSMOS_DB_SCRAPES_CONTAINER_NAME ?? "Scrapes";

/** The store methods the scrape service and admin routes rely on. */
export type ScrapeStoreLike = Pick<
  ScrapeStore,
  | "getDomainRule"
  | "upsertDomainRule"
  | "listDomainRules"
  | "getUrlState"
  | "upsertUrlState"
  | "createVersion"
  | "getVersionByToken"
  | "listUrlStates"
  | "getDocumentsForUrl"
>;

export class ScrapeStore {
  private get container() {
    return getCosmosClient().database(databaseId).container(containerId);
  }

  async getDomainRule(domain: string): Promise<ScrapeDomainRule | undefined> {
    const { resource } = await this.container
      .item(domainRuleId(domain), domain)
      .read<ScrapeDomainRule>();
    return resource;
  }

  async upsertDomainRule(rule: ScrapeDomainRule): Promise<ScrapeDomainRule> {
    const { resource } = await this.container.items.upsert(rule);
    return resource as unknown as ScrapeDomainRule;
  }

  async listDomainRules(): Promise<ScrapeDomainRule[]> {
    const { resources } = await this.container.items
      .query<ScrapeDomainRule>({
        query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.domain",
        parameters: [{ name: "@type", value: "domain_rule" }],
      })
      .fetchAll();
    return resources;
  }

  async getUrlState(
    url: string,
    domain: string,
  ): Promise<ScrapeUrlState | undefined> {
    const resource = await this.readItem<ScrapeUrlState>(urlStateId(url), domain);
    if (resource) return resource;

    const { resources } = await this.container.items
      .query<ScrapeUrlState>({
        query:
          "SELECT * FROM c WHERE c.type = @type AND c.domain = @domain AND c.url = @url OFFSET 0 LIMIT 1",
        parameters: [
          { name: "@type", value: "url_state" },
          { name: "@domain", value: domain },
          { name: "@url", value: url },
        ],
      })
      .fetchAll();
    return resources[0];
  }

  async upsertUrlState(state: ScrapeUrlState): Promise<ScrapeUrlState> {
    const { resource } = await this.container.items.upsert(state);
    return resource as unknown as ScrapeUrlState;
  }

  async createVersion(version: ScrapeVersion): Promise<ScrapeVersion> {
    const { resource } = await this.container.items.upsert(version);
    return resource as unknown as ScrapeVersion;
  }

  async getVersionByToken(token: string): Promise<ScrapeVersion | undefined> {
    const domain = token.split(":")[1] ?? "";
    if (domain) {
      const resource = await this.readItem<ScrapeVersion>(versionId(token), domain);
      if (resource) return resource;
    }

    const { resources } = await this.container.items
      .query<ScrapeVersion>({
        query:
          "SELECT * FROM c WHERE c.type = @type AND c.token = @token OFFSET 0 LIMIT 1",
        parameters: [
          { name: "@type", value: "scrape_version" },
          { name: "@token", value: token },
        ],
      })
      .fetchAll();
    return resources[0];
  }

  async listUrlStates(domain?: string): Promise<ScrapeUrlState[]> {
    const query = domain
      ? {
          query:
            "SELECT * FROM c WHERE c.type = @type AND c.domain = @domain ORDER BY c.url",
          parameters: [
            { name: "@type", value: "url_state" },
            { name: "@domain", value: domain },
          ],
        }
      : {
          query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.domain, c.url",
          parameters: [{ name: "@type", value: "url_state" }],
        };
    const { resources } = await this.container.items
      .query<ScrapeUrlState>(query)
      .fetchAll();
    return resources;
  }

  async getDocumentsForUrl(
    url: string,
    domain: string,
  ): Promise<ScrapeDocument[]> {
    const { resources } = await this.container.items
      .query<ScrapeDocument>({
        query:
          "SELECT * FROM c WHERE c.type = @type AND c.domain = @domain AND c.url = @url ORDER BY c.createdAt DESC",
        parameters: [
          { name: "@type", value: "scrape_version" },
          { name: "@domain", value: domain },
          { name: "@url", value: url },
        ],
      })
      .fetchAll();
    return resources;
  }

  private async readItem<T extends ItemDefinition>(
    id: string,
    partitionKey: string,
  ): Promise<T | undefined> {
    try {
      const { resource } = await this.container.item(id, partitionKey).read<T>();
      return resource;
    } catch (error) {
      if (typeof error === "object" && error && "code" in error) {
        const code = (error as { code?: unknown }).code;
        if (code === 404) return undefined;
      }
      throw error;
    }
  }
}

/**
 * Cosmos-free store used without COSMOS_DB_ENDPOINT (e.g. on Cloud Run with
 * a bucket mounted at DATA_DIR): one JSON file per document at
 * `${DATA_DIR}/scrapes/<type>/<id>.json`. Ids (`domain:<host>`,
 * `url:<sha256>`, `version:<sha256>`) are filename-safe. The hot path
 * (domain rule, URL state, version by token) is a single read by id; the
 * admin listings read a whole type directory. Runs single-instance.
 */
export class FileScrapeStore implements ScrapeStoreLike {
  private readonly root: string;
  private readonly ready: Promise<void>;

  constructor(dataDir = process.env.DATA_DIR ?? "data", seedDomains = "") {
    this.root = path.join(dataDir, "scrapes");
    this.ready = this.seedAllowedDomains(seedDomains);
  }

  /** Allow the listed domains unless a rule for them already exists. */
  private async seedAllowedDomains(domains: string): Promise<void> {
    for (const raw of domains.split(",")) {
      const domain = raw.trim().toLowerCase();
      if (!domain) continue;
      const id = domainRuleId(domain);
      if (await this.read<ScrapeDomainRule>("domain_rule", id)) continue;
      await this.write({
        id,
        type: "domain_rule",
        domain,
        allowed: true,
        notes: "Seeded from SCRAPE_ALLOWED_DOMAINS",
        updatedAt: Date.now(),
      });
    }
  }

  async getDomainRule(domain: string): Promise<ScrapeDomainRule | undefined> {
    await this.ready;
    return this.read<ScrapeDomainRule>("domain_rule", domainRuleId(domain));
  }

  async upsertDomainRule(rule: ScrapeDomainRule): Promise<ScrapeDomainRule> {
    return this.write(rule);
  }

  async listDomainRules(): Promise<ScrapeDomainRule[]> {
    await this.ready;
    const rules = await this.readAll<ScrapeDomainRule>("domain_rule");
    return rules.sort((a, b) => a.domain.localeCompare(b.domain));
  }

  async getUrlState(
    url: string,
    _domain: string,
  ): Promise<ScrapeUrlState | undefined> {
    return this.read<ScrapeUrlState>("url_state", urlStateId(url));
  }

  async upsertUrlState(state: ScrapeUrlState): Promise<ScrapeUrlState> {
    return this.write(state);
  }

  async createVersion(version: ScrapeVersion): Promise<ScrapeVersion> {
    return this.write(version);
  }

  async getVersionByToken(token: string): Promise<ScrapeVersion | undefined> {
    return this.read<ScrapeVersion>("scrape_version", versionId(token));
  }

  async listUrlStates(domain?: string): Promise<ScrapeUrlState[]> {
    const states = await this.readAll<ScrapeUrlState>("url_state");
    return states
      .filter((state) => !domain || state.domain === domain)
      .sort(
        (a, b) =>
          a.domain.localeCompare(b.domain) || a.url.localeCompare(b.url),
      );
  }

  async getDocumentsForUrl(
    url: string,
    _domain: string,
  ): Promise<ScrapeDocument[]> {
    const versions = await this.readAll<ScrapeVersion>("scrape_version");
    return versions
      .filter((version) => version.url === url)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private filePath(type: ScrapeDocument["type"], id: string): string {
    return path.join(this.root, type, `${id}.json`);
  }

  private async read<T extends ScrapeDocument>(
    type: T["type"],
    id: string,
  ): Promise<T | undefined> {
    try {
      const text = await fs.promises.readFile(this.filePath(type, id), "utf8");
      return JSON.parse(text) as T;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async readAll<T extends ScrapeDocument>(
    type: T["type"],
  ): Promise<T[]> {
    let names: string[];
    try {
      names = await fs.promises.readdir(path.join(this.root, type));
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return [];
      throw error;
    }
    const docs = (await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => this.read<T>(type, name.slice(0, -".json".length))),
    )) as (T | undefined)[];
    return docs.filter((doc): doc is T => doc !== undefined);
  }

  private async write<T extends ScrapeDocument>(doc: T): Promise<T> {
    const file = this.filePath(doc.type, doc.id);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(doc));
    return doc;
  }
}

export const scrapeStore: ScrapeStoreLike = process.env.COSMOS_DB_ENDPOINT
  ? new ScrapeStore()
  : new FileScrapeStore(
      process.env.DATA_DIR ?? "data",
      process.env.SCRAPE_ALLOWED_DOMAINS ?? "",
    );
console.log(
  `[jupytutor] scrape store + interaction logs: ${process.env.COSMOS_DB_ENDPOINT ? "cosmos db" : `files under ${process.env.DATA_DIR ?? "data"}`}`,
);
