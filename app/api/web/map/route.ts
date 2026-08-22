import { cacheService } from "@/lib/cache/cache-service";
import { cacheKeys } from "@/lib/cache/keys";
import { TTL } from "@/lib/cache/ttl";
import { extractLinksFromHtml, getPathDepth, normalizeDiscoveredUrl, safeFetchText, type DiscoveredLink } from "@/lib/web-intel";

export const maxDuration = 10;

type MapRequest = {
  url?: unknown;
  limit?: unknown;
};

function xmlLocs(xml: string): string[] {
  const matches = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)];
  return matches.map((match) => match[1]);
}

function parseRobotsSitemaps(text: string, baseUrl: string): string[] {
  const matches = [...text.matchAll(/^sitemap:\s*(.+)$/gim)];
  return matches
    .map((match) => normalizeDiscoveredUrl(match[1], baseUrl))
    .filter((value): value is string => Boolean(value));
}

function dedupeAndLimit(links: DiscoveredLink[], limit: number): DiscoveredLink[] {
  const seen = new Set<string>();
  const out: DiscoveredLink[] = [];
  for (const link of links) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    out.push(link);
    if (out.length >= limit) break;
  }
  return out;
}

export async function POST(req: Request) {
  let body: MapRequest;
  try {
    body = (await req.json()) as MapRequest;
  } catch {
    return Response.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return Response.json({ success: false, error: "A url is required." }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return Response.json({ success: false, error: "Invalid URL." }, { status: 400 });
  }

  const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 500) : 100;
  const origin = url.origin;
  const roots = new Set<string>();
  const discovered: DiscoveredLink[] = [];

  const robotsText = await safeFetchText(`${origin}/robots.txt`, 3000);
  if (robotsText) {
    for (const sitemapUrl of parseRobotsSitemaps(robotsText, origin)) {
      roots.add(sitemapUrl);
    }
  }

  roots.add(`${origin}/sitemap.xml`);
  roots.add(url.toString());

  const sitemapTargets = [...roots];
  for (const target of sitemapTargets) {
    const text = await safeFetchText(target, 3000);
    if (!text) continue;
    const locs = xmlLocs(text);
    if (locs.length) {
      for (const loc of locs) {
        const normalized = normalizeDiscoveredUrl(loc, origin);
        if (!normalized) continue;
        discovered.push({
          url: normalized,
          depth: getPathDepth(normalized),
        });
      }
      continue;
    }

    if (target === url.toString()) {
      discovered.push(...extractLinksFromHtml(text, origin));
    }
  }

  const key = cacheKeys.map(url.toString());
  const { data, cached } = await cacheService.withCache(key, TTL.MAP, async () => {
    const links = dedupeAndLimit(
      discovered
        .filter((link) => link.url.startsWith(origin))
        .sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url)),
      limit,
    );
    return { links };
  });

  return Response.json({
    success: true,
    cached,
    data,
  });
}
