import { NextRequest } from "next/server";

/**
 * MVP admin auth: single shared key, since you (the operator) are the
 * only person hitting these endpoints right now. Upgrade path: Better
 * Auth + real login once a business-owner-facing dashboard is built
 * (see architecture standard §4 — RBAC baseline). Don't build that
 * before it's needed.
 */
export function requireAdmin(req: NextRequest): { ok: true } | { ok: false; status: number } {
  const key = req.headers.get("x-admin-key");
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}
