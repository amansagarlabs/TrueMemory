import { verifySession } from "@/lib/auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);

export async function requireAdmin(request: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return { ok: false, status: 401, error: "Admin authorization required." };
  }

  const session = await verifySession(token);
  if (!session) {
    return { ok: false, status: 401, error: "Invalid session." };
  }

  const email = session.user.email.trim().toLowerCase();
  const isAdmin = ADMIN_EMAILS.length > 0 ? ADMIN_EMAILS.includes(email) : session.user.plan === "enterprise";
  if (!isAdmin) {
    return { ok: false, status: 403, error: "Admin access required." };
  }

  return { ok: true };
}
