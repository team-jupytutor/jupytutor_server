import type {
  SourceResolverContext,
  SourceResolverPlugin,
  SourceResolverResult,
} from "./base.js";

export class GithubRawResolver implements SourceResolverPlugin {
  name = "github-raw";

  resolveUrl(url: string, _context: SourceResolverContext): SourceResolverResult | null {
    const parsed = new URL(url);
    if (parsed.hostname === "raw.githubusercontent.com") return null;
    if (parsed.hostname !== "github.com") return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex(
      (part) => part === "edit" || part === "blob",
    );
    if (parts.length < 5 || markerIndex !== 2) return null;

    const [owner, repo, , branch, ...pathParts] = parts;
    return {
      type: "continue",
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathParts.join(
        "/",
      )}`,
      reason: "Rewrite GitHub edit/blob URL to raw content URL.",
      data: { owner, repo, branch, path: pathParts.join("/") },
    };
  }
}
