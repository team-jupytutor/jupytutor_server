export class Resource {
  private content: Record<string, string>;

  constructor(content: Record<string, string>) {
    this.content = content;
  }

  get(url: string): string | undefined {
    const lower = url.toLowerCase();
    for (const key of Object.keys(this.content)) {
      if (lower.includes(key)) {
        return this.content[key];
      }
    }
    return undefined;
  }

  getFromURLs(urls: string[]): string {
    return urls
      .map((url) => this.get(url))
      .filter((s): s is string => s !== undefined)
      .join("\n\n");
  }

  keys(): string[] {
    return Object.keys(this.content);
  }
}
