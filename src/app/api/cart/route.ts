import { NextResponse } from "next/server";
import { getCart, getMandateForSession, mutateCart } from "@/lib/cart";
import { priceCart } from "@/lib/quote";
import { writeAudit } from "@/lib/audit";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  const cart = getCart(sessionId);
  const mandate = getMandateForSession(sessionId);
  return NextResponse.json({ cart, priced: priceCart(cart), mandate });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    action?: "add" | "remove" | "set" | "clear";
    sku?: string;
    qty?: number;
    pricePaise?: number;
    amountPaise?: number;
    price?: number;
  };
  if (!body.sessionId || !body.action) {
    return NextResponse.json({ error: "sessionId and action required" }, { status: 400 });
  }
  const limited = rateLimit(`cart:${clientKey(request, body.sessionId)}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }
  if (
    typeof body.pricePaise === "number" ||
    typeof body.amountPaise === "number" ||
    typeof body.price === "number"
  ) {
    writeAudit({
      sessionId: body.sessionId,
      type: "cart.price_injection_blocked",
      explainable: true,
      bounded: true,
      gated: true,
      reason: "Client tried to pass a price on cart mutate. Catalog storage prices the line.",
      data: {
        attempted: body.pricePaise ?? body.amountPaise ?? body.price,
        sku: body.sku,
      },
    });
  }
  const qty = Math.min(20, Math.max(1, Math.floor(Number(body.qty) || 1)));
  const cart = mutateCart(body.sessionId, body.action, body.sku, qty);
  const mandate = getMandateForSession(body.sessionId);
  return NextResponse.json({ cart, priced: priceCart(cart), mandate });
}
