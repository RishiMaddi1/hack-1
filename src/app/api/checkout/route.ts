import { NextResponse } from "next/server";
import { quoteCheckout } from "@/lib/checkout";
import { writeAudit } from "@/lib/audit";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { authenticateShopper, extractShopperToken, requireBudget } from "@/lib/shoppers";
import { getDb } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    amountPaise?: number;
    amount?: number;
    shopperToken?: string;
  };
  const limited = rateLimit(`checkout:${clientKey(request, body.sessionId)}`, 15, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  const token = extractShopperToken(request, body as Record<string, unknown>);
  let sessionId = body.sessionId || "";

  if (token) {
    const auth = authenticateShopper(token);
    if (!auth.ok) return NextResponse.json(auth, { status: auth.status });
    const budget = requireBudget(auth.session);
    if (budget) return NextResponse.json(budget, { status: budget.status });
    sessionId = auth.session.id;
  } else if (!sessionId) {
    return NextResponse.json({ error: "sessionId or shopperToken required" }, { status: 400 });
  } else {
    const session = getDb().sessions[sessionId];
    if (session?.shopperId) {
      return NextResponse.json(
        { error: "SHOPPER_REQUIRED", message: "Pass X-Shopper-Token for this shopper session." },
        { status: 401 },
      );
    }
  }

  if (typeof body.amountPaise === "number" || typeof body.amount === "number") {
    writeAudit({
      sessionId,
      type: "checkout.amount_injection_blocked",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Client tried to pass amount (${body.amountPaise ?? body.amount}). Ignored — server prices the cart only.`,
      data: { attemptedAmountPaise: body.amountPaise ?? body.amount },
    });
  }
  const result = await quoteCheckout(sessionId);
  return NextResponse.json(result.body, { status: result.status });
}
