import { NextResponse } from "next/server";
import { getCart, getMandateForSession, mutateCart } from "@/lib/cart";
import { priceCart } from "@/lib/quote";
import { writeAudit } from "@/lib/audit";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { authenticateShopper, extractShopperToken, requireBudget } from "@/lib/shoppers";
import { getDb } from "@/lib/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionIdParam = url.searchParams.get("sessionId") || "";
  const token = request.headers.get("x-shopper-token") || undefined;
  let sessionId = sessionIdParam;

  if (token) {
    const auth = authenticateShopper(token);
    if (!auth.ok) return NextResponse.json(auth, { status: auth.status });
    sessionId = auth.session.id;
  }
  if (!sessionId) return NextResponse.json({ error: "sessionId or X-Shopper-Token required" }, { status: 400 });

  const cart = getCart(sessionId);
  const mandate = getMandateForSession(sessionId);
  const session = getDb().sessions[sessionId];
  return NextResponse.json({
    cart,
    priced: priceCart(cart),
    mandate,
    budgetSet: Boolean(session?.budgetSet),
    shopperId: session?.shopperId,
  });
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
    shopperToken?: string;
  };
  const limited = rateLimit(`cart:${clientKey(request, body.sessionId)}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  const token = extractShopperToken(request, body as Record<string, unknown>);
  let sessionId = body.sessionId || "";

  // Shopper-bound path (shop UI + MCP HTTP)
  if (token) {
    const auth = authenticateShopper(token);
    if (!auth.ok) return NextResponse.json(auth, { status: auth.status });
    const budget = requireBudget(auth.session);
    if (budget) return NextResponse.json(budget, { status: budget.status });
    sessionId = auth.session.id;
  } else if (!sessionId) {
    return NextResponse.json(
      { error: "SHOPPER_REQUIRED", message: "Pass X-Shopper-Token (register first) or sessionId for lab." },
      { status: 401 },
    );
  } else {
    // Lab / legacy: sessionId without token — only if no shopper bound
    const session = getDb().sessions[sessionId];
    if (session?.shopperId) {
      return NextResponse.json(
        { error: "SHOPPER_REQUIRED", message: "This session belongs to a shopper — pass X-Shopper-Token." },
        { status: 401 },
      );
    }
  }

  if (!body.action) {
    return NextResponse.json({ error: "sessionId and action required" }, { status: 400 });
  }
  if (
    typeof body.pricePaise === "number" ||
    typeof body.amountPaise === "number" ||
    typeof body.price === "number"
  ) {
    writeAudit({
      sessionId,
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
  const qtyRaw = Number(body.qty);
  // Allow 0 on "set" so UI minus from 1 removes the line. Other actions keep qty ≥ 1.
  const qty =
    body.action === "set"
      ? Math.min(20, Math.max(0, Math.floor(Number.isFinite(qtyRaw) ? qtyRaw : 0)))
      : Math.min(20, Math.max(1, Math.floor(Number.isFinite(qtyRaw) ? qtyRaw : 1) || 1));
  const cart = mutateCart(sessionId, body.action, body.sku, qty);
  const mandate = getMandateForSession(sessionId);
  return NextResponse.json({ cart, priced: priceCart(cart), mandate });
}
