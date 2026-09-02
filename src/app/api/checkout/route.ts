import { NextResponse } from "next/server";
import { quoteCheckout } from "@/lib/checkout";
import { writeAudit } from "@/lib/audit";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    amountPaise?: number;
    amount?: number;
  };
  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const limited = rateLimit(`checkout:${clientKey(request, body.sessionId)}`, 15, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }
  // LLM / client must never set the Order amount — reject if they try.
  if (typeof body.amountPaise === "number" || typeof body.amount === "number") {
    writeAudit({
      sessionId: body.sessionId,
      type: "checkout.amount_injection_blocked",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Client tried to pass amount (${body.amountPaise ?? body.amount}). Ignored — server prices the cart only.`,
      data: { attemptedAmountPaise: body.amountPaise ?? body.amount },
    });
  }
  const result = await quoteCheckout(body.sessionId);
  return NextResponse.json(result.body, { status: result.status });
}
