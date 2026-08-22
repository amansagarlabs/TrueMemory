export type SearchHit = {
  title: string;
  url: string;
  description: string;
  position: number;
};

const SEARXNG_URL = process.env.SEARXNG_URL || process.env.NEXT_PUBLIC_SEARXNG_URL;

function normalizeResultUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const redirected = parsed.searchParams.get("url") || parsed.searchParams.get("uddg");
    if (redirected) return decodeURIComponent(redirected);
  } catch {
    // ignore
  }
  return url;
}

export async function searchConfiguredWeb(query: string, limit: number): Promise<SearchHit[]> {
  if (!SEARXNG_URL) {
    throw new Error("Search provider not configured. Set SEARXNG_URL.");
  }

  const endpoint = new URL("/search", SEARXNG_URL);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("language", "en");
  endpoint.searchParams.set("safesearch", "1");

  const response = await fetch(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Search provider failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const results = payload.results ?? [];

  return results.slice(0, limit).map((item, index) => ({
    title: item.title?.trim() || item.url || `Result ${index + 1}`,
    url: item.url ? normalizeResultUrl(item.url) : "",
    description: item.content?.trim() || "",
    position: index + 1,
  })).filter((item) => Boolean(item.url));
}
