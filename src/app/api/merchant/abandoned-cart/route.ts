import { NextResponse } from "next/server";
import { runAbandonedCartEmails } from "@/lib/abandoned-cart";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Merchant / demo control — POST /api/merchant/abandoned-cart
 * Same job as cron (`runAbandonedCartEmails`). No CRON_SECRET in the browser.
 * Optional JSON: { "minAgeMs": 0, "dryRun": true }
 *
 * Azure should call POST /api/cron/abandoned-cart with Bearer CRON_SECRET instead.
 * Dedup: shoppers with abandonedEmailSentAt are skipped (one email per abandon).
 */
export async function POST(request: Request) {
  const limited = rateLimit(`merchant-abandoned:${clientKey(request)}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  // Demo default: eligible on next cron tick (0). Prod cron can pass a higher minAgeMs.
  let minAgeMs: number | undefined = Number(process.env.ABANDONED_CART_MIN_AGE_MS || 0);
  let dryRun = false;
  let force = false;
  try {
    const body = (await request.json()) as { minAgeMs?: number; dryRun?: boolean; force?: boolean };
    if (typeof body.minAgeMs === "number") minAgeMs = body.minAgeMs;
    dryRun = Boolean(body.dryRun);
    force = Boolean(body.force);
  } catch {
    /* empty body ok */
  }

  const result = await runAbandonedCartEmails({ minAgeMs, dryRun, force });
  return NextResponse.json({
    ok: true,
    minAgeMs,
    force,
    note: force
      ? "force=true ignored abandonedEmailSentAt (test only)."
      : "Already-emailed shoppers are skipped (abandonedEmailSentAt). Azure cron → /api/cron/abandoned-cart + Bearer CRON_SECRET.",
    ...result,
  });
}
