import { cacheService } from "@/lib/cache/cache-service";
import { requireAdmin } from "@/lib/admin";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const stats = await cacheService.getStats();
  return Response.json(stats);
}
