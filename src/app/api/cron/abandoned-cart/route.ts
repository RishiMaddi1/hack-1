import { NextResponse } from "next/server";
import { runAbandonedCartEmails } from "@/lib/abandoned-cart";

/**
 * POST /api/cron/abandoned-cart
 * Authorization: Bearer <CRON_SECRET>
 *
 * Optional JSON: { "minAgeMs": 0, "dryRun": true } for demos.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let minAgeMs: number | undefined;
  let dryRun = false;
  try {
    const body = (await request.json()) as { minAgeMs?: number; dryRun?: boolean };
    if (typeof body.minAgeMs === "number") minAgeMs = body.minAgeMs;
    dryRun = Boolean(body.dryRun);
  } catch {
    /* empty body ok */
  }

  const result = await runAbandonedCartEmails({ minAgeMs, dryRun });
  return NextResponse.json({ ok: true, ...result });
}
