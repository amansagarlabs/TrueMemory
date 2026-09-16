import dns from "node:dns/promises";
import net from "node:net";

export type DiscoveredLink = {
  url: string;
  title?: string;
  depth: number;
};

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function isPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized !== "::1" && !normalized.startsWith("fe80:") && !normalized.startsWith("fc") && !normalized.startsWith("fd");
  }
  return false;
}

export async function validatePublicUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Only public http and https URLs are supported.");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!hostname || BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".localhost") || (parsed.port && !["80", "443"].includes(parsed.port))) {
    throw new Error("Local and private network addresses are not allowed.");
  }
  const addresses = net.isIP(hostname) ? [hostname] : (await dns.lookup(hostname, { all: true })).map(({ address }) => address);
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
    throw new Error("The URL resolves to a local or private network address.");
  }
  return parsed.toString();
}

export function normalizeDiscoveredUrl(rawUrl: string, baseUrl?: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
    return null;
  }

  try {
    const resolved = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    resolved.hash = "";
    resolved.username = "";
    resolved.password = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

export function getPathDepth(urlString: string): number {
  try {
    const path = new URL(urlString).pathname.replace(/\/+$/, "");
    if (!path || path === "/") return 0;
    return path.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function extractLinksFromHtml(html: string, baseUrl: string): DiscoveredLink[] {
  const links = new Map<string, DiscoveredLink>();
  const anchorPattern = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const url = normalizeDiscoveredUrl(match[2], baseUrl);
    if (!url) continue;
    if (links.has(url)) continue;

    const title = match[3]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    links.set(url, {
      url,
      title: title || undefined,
      depth: getPathDepth(url),
    });
  }

  return [...links.values()];
}

export async function safeFetchText(url: string, timeoutMs = 5000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const safeUrl = await validatePublicUrl(url);
    const response = await fetch(safeUrl, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
