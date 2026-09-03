import { NextResponse } from "next/server";
import {
  runAbandonedCartEmails,
  sendAbandonedCartForSession,
} from "@/lib/abandoned-cart";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Merchant / demo control — POST /api/merchant/abandoned-cart
 * Same job as cron (`runAbandonedCartEmails`). No CRON_SECRET in the browser.
 * Optional JSON: { "minAgeMs": 0, "dryRun": true, "force": true, "sessionId": "ses_…" }
 *
 * With sessionId: send reminder for that one left cart (demo click → send).
 * Azure should call POST /api/cron/abandoned-cart with Bearer CRON_SECRET instead.
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
  let sessionId: string | undefined;
  try {
    const body = (await request.json()) as {
      minAgeMs?: number;
      dryRun?: boolean;
      force?: boolean;
      sessionId?: string;
    };
    if (typeof body.minAgeMs === "number") minAgeMs = body.minAgeMs;
    dryRun = Boolean(body.dryRun);
    force = Boolean(body.force);
    if (typeof body.sessionId === "string" && body.sessionId.trim()) {
      sessionId = body.sessionId.trim();
    }
  } catch {
    /* empty body ok */
  }

  if (sessionId) {
    const one = await sendAbandonedCartForSession(sessionId, { minAgeMs, dryRun, force });
    if (!one.ok) {
      return NextResponse.json(
        {
          ok: false,
          sessionId,
          force,
          minAgeMs,
          error: one.error,
          code: one.code,
        },
        { status: one.code === "no_session" ? 404 : 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      sessionId,
      force,
      minAgeMs,
      sent: 1,
      email: one.email,
      shopperId: one.shopperId,
      dryRun: one.dryRun || false,
      note: force
        ? "force=true ignored abandonedEmailSentAt (test only)."
        : "One-session reminder sent.",
    });
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
