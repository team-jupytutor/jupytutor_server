import crypto from "crypto";

export function getDomainForUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function urlStateId(url: string): string {
  return `url:${hash(url)}`;
}

export function domainRuleId(domain: string): string {
  return `domain:${domain.toLowerCase()}`;
}

export function versionId(token: string): string {
  return `version:${hash(token)}`;
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
