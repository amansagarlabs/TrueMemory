import { scrapeWithRetry } from "@/lib/web-scrape";
import { cacheService } from "@/lib/cache/cache-service";
import { cacheKeys } from "@/lib/cache/keys";
import { TTL } from "@/lib/cache/ttl";
import { searchConfiguredWeb } from "@/lib/web-search";

export const maxDuration = 30;

type SearchRequest = {
  query?: unknown;
  limit?: unknown;
  formats?: unknown;
};

function isFormatList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function POST(req: Request) {
  let body: SearchRequest;
  try {
    body = (await req.json()) as SearchRequest;
  } catch {
    return Response.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return Response.json({ success: false, error: "A query is required." }, { status: 400 });
  }

  const limit = typeof body.limit === "number" ? Math.min(Math.max(Math.trunc(body.limit), 1), 10) : 5;
  const formats = isFormatList(body.formats) ? body.formats : ["markdown"];
  const wantMarkdown = formats.includes("markdown");

  try {
    const key = cacheKeys.search(query, limit);
    const { data, cached } = await cacheService.withCache(key, TTL.SEARCH, async () => {
      const hits = await searchConfiguredWeb(query, limit);
      const web = await Promise.all(
        hits.map(async (hit) => {
          const scraped = await scrapeWithRetry(hit.url);
          return {
            url: hit.url,
            title: scraped.metadata.title || hit.title,
            description: scraped.metadata.description || hit.description,
            markdown: wantMarkdown ? scraped.markdown : "",
            position: hit.position,
          };
        }),
      );
      return { web };
    });

    return Response.json({
      success: true,
      cached,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return Response.json({ success: false, error: message }, { status: 502 });
  }
}
