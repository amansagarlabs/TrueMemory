import { restoreScrapeSession } from "@/lib/web-scrape";

type Params = {
  scrapeId: string;
};

export async function POST(_req: Request, context: { params: Promise<Params> }) {
  const { scrapeId } = await context.params;
  try {
    const record = await restoreScrapeSession(scrapeId);
    return Response.json({
      success: true,
      data: {
        scrapeId: record.scrapeId,
        sourceUrl: record.sourceUrl,
        currentUrl: record.currentUrl,
        status: record.status,
        lastAction: record.lastAction,
        canRestore: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to restore session.";
    return Response.json({ success: false, error: message, recoverable: true }, { status: 409 });
  }
}
