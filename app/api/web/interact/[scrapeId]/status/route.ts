import { getScrapeSessionStatus } from "@/lib/web-scrape";

type Params = {
  scrapeId: string;
};

export async function GET(_req: Request, context: { params: Promise<Params> }) {
  const { scrapeId } = await context.params;
  const record = await getScrapeSessionStatus(scrapeId);

  if (!record) {
    return Response.json({ success: false, error: "Session not found." }, { status: 404 });
  }

  return Response.json({
    success: true,
    data: {
      scrapeId: record.scrapeId,
      sourceUrl: record.sourceUrl,
      currentUrl: record.currentUrl,
      lastAction: record.lastAction,
      status: record.status,
      lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt,
      hasStorageState: Boolean(record.storageState),
      canRestore: record.status !== "stale" && record.status !== "expired",
    },
  });
}
