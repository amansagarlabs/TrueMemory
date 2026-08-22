import { closeScrapeSession, interactWithScrapeSession } from "@/lib/web-scrape";

type Params = {
  scrapeId: string;
};

export async function POST(req: Request, context: { params: Promise<Params> }) {
  let body: { prompt?: unknown };
  try {
    body = (await req.json()) as { prompt?: unknown };
  } catch {
    return Response.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ success: false, error: "A prompt is required." }, { status: 400 });
  }

  const { scrapeId } = await context.params;
  try {
    const result = await interactWithScrapeSession(scrapeId, prompt);
    return Response.json({ success: true, output: result.output, html: result.html, text: result.text });
  } catch (error) {
    const recoverable = Boolean((error as Error & { recoverable?: boolean }).recoverable);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Interaction failed.",
        recoverable,
        action: recoverable ? "restore-or-discard" : "start-new",
      },
      { status: recoverable ? 409 : 404 },
    );
  }
}

export async function DELETE(_req: Request, context: { params: Promise<Params> }) {
  const { scrapeId } = await context.params;
  const closed = await closeScrapeSession(scrapeId);
  if (!closed) {
    return Response.json({ success: false, error: "Session not found." }, { status: 404 });
  }
  return Response.json({ success: true });
}
