import { Resource } from "./Resource.js";

export class GlobalResource {
  private resources: Map<string, Resource> = new Map();

  register(name: string, resource: Resource): void {
    this.resources.set(name, resource);
  }

  get(url: string): string | undefined {
    for (const resource of Array.from(this.resources.values())) {
      const result = resource.get(url);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  getFromURLs(urls: string[]): string {
    return urls
      .map((url) => this.get(url))
      .filter((s): s is string => s !== undefined)
      .join("\n\n");
  }

  getResource(name: string): Resource | undefined {
    return this.resources.get(name);
  }
}
