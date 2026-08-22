import { cacheService } from "@/lib/cache/cache-service";
import { cacheKeys } from "@/lib/cache/keys";
import { TTL, classifyFreshness } from "@/lib/cache/ttl";
import { openScrapeSession, scrapeWithRetry } from "@/lib/web-scrape";

export const maxDuration = 20;

type ScrapeRequest = {
  url?: unknown;
  formats?: unknown;
  waitFor?: unknown;
};

function isFormatList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function POST(req: Request) {
  let body: ScrapeRequest;
  try {
    body = (await req.json()) as ScrapeRequest;
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

  const waitFor = typeof body.waitFor === "number" ? Math.max(0, Math.min(body.waitFor, 10_000)) : 0;
  const formats = isFormatList(body.formats) ? body.formats : ["markdown"];
  const wantMarkdown = formats.includes("markdown");
  const wantHtml = formats.includes("html");
  const keepAlive = formats.includes("screenshot");

  try {
    const key = cacheKeys.scrape(url.toString(), formats);
    const ttl = classifyFreshness(url.toString()) === "stable" ? TTL.SCRAPE_STABLE : TTL.SCRAPE_VOLATILE;
    const { data, cached } = keepAlive
      ? { data: await openScrapeSession(url.toString(), waitFor), cached: false }
      : await cacheService.withCache(key, ttl, async () => scrapeWithRetry(url.toString(), waitFor));
    return Response.json({
      success: true,
      cached,
      data: {
        markdown: wantMarkdown ? data.markdown : "",
        html: wantHtml ? data.html : "",
        metadata: data.metadata,
        links: data.links,
        scrapeId: "scrapeId" in data ? data.scrapeId : undefined,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scrape failed.";
    return Response.json({ success: false, error: message }, { status: 502 });
  }
}
