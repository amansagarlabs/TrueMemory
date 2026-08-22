import { cacheService } from "@/lib/cache/cache-service";
import { requireAdmin } from "@/lib/admin";

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  let body: { pattern?: unknown };
  try {
    body = (await request.json()) as { pattern?: unknown };
  } catch {
    return Response.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const pattern = typeof body.pattern === "string" ? body.pattern.trim() : "";
  if (!pattern) {
    return Response.json({ success: false, error: "pattern is required." }, { status: 400 });
  }

  await cacheService.invalidatePattern(pattern);
  return Response.json({ success: true, invalidated: pattern });
}
