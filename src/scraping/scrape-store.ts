import "dotenv/config";
import { CosmosClient, type ItemDefinition } from "@azure/cosmos";
import type {
  ScrapeDomainRule,
  ScrapeDocument,
  ScrapeUrlState,
  ScrapeVersion,
} from "./types.js";
import { domainRuleId, urlStateId, versionId } from "./url.js";

const client = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_MASTER_KEY,
});

const databaseId = process.env.COSMOS_DB_DATABASE_NAME ?? "jupytutor";
const containerId =
  process.env.COSMOS_DB_SCRAPES_CONTAINER_NAME ?? "Scrapes";

export class ScrapeStore {
  private get container() {
    return client.database(databaseId).container(containerId);
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

export const scrapeStore = new ScrapeStore();
