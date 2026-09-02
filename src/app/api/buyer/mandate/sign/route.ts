import { NextResponse } from "next/server";
import { getMandateForSession } from "@/lib/cart";
import { getDb, getOrCreateSession, saveDb } from "@/lib/store";
import { issueMandate } from "@/lib/mandate-signer";
import { writeAudit } from "@/lib/audit";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { authenticateShopper, extractShopperToken, setShopperBudget } from "@/lib/shoppers";

const MIN_MANDATE_PAISE = 100_00;
const MAX_MANDATE_PAISE = 500_000_00;

/**
 * Buyer signing authority surface. Merchant gate verifies with the public key only.
 * Prefer shopperToken + set_budget; sessionId path kept for lab.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    maxPaise?: number;
    maxRupees?: number;
    expiresAt?: string;
    shopperToken?: string;
  };
  const token = extractShopperToken(request, body as Record<string, unknown>);
  const limited = rateLimit(`mandate:${clientKey(request, body.sessionId)}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  if (token) {
    const maxRupees =
      typeof body.maxRupees === "number"
        ? body.maxRupees
        : typeof body.maxPaise === "number"
          ? body.maxPaise / 100
          : undefined;
    if (typeof maxRupees !== "number") {
      return NextResponse.json({ error: "maxRupees or maxPaise required" }, { status: 400 });
    }
    const result = setShopperBudget({ shopperToken: token, maxRupees });
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    return NextResponse.json({ mandate: result.mandate, budgetSet: true });
  }

  if (!body.sessionId || !body.maxPaise) {
    return NextResponse.json({ error: "sessionId and maxPaise required (or shopperToken)" }, { status: 400 });
  }
  if (
    !Number.isFinite(body.maxPaise) ||
    body.maxPaise < MIN_MANDATE_PAISE ||
    body.maxPaise > MAX_MANDATE_PAISE
  ) {
    return NextResponse.json(
      { error: `maxPaise must be between ${MIN_MANDATE_PAISE} and ${MAX_MANDATE_PAISE}.` },
      { status: 400 },
    );
  }
  const session = getOrCreateSession(body.sessionId);
  if (session.shopperId) {
    return NextResponse.json(
      { error: "SHOPPER_REQUIRED", message: "Pass X-Shopper-Token for this shopper session." },
      { status: 401 },
    );
  }
  const db = getDb();
  const current = db.mandates[session.mandateId];
  const expiresAt =
    body.expiresAt ||
    current.expiresAt ||
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const signed = issueMandate({
    id: current.id,
    agentId: current.agentId,
    merchantId: current.merchantId,
    maxPaise: body.maxPaise,
    remainingPaise: body.maxPaise,
    categories: current.categories,
    expiresAt,
    createdAt: current.createdAt,
  });
  Object.assign(current, signed);
  session.budgetSet = true;
  saveDb();
  writeAudit({
    sessionId: body.sessionId,
    type: "mandate.signed",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Buyer authority signed mandate ${current.id} (alg Ed25519) at ₹${body.maxPaise / 100}.`,
    data: { mandateId: current.id, kid: current.kid, maxPaise: current.maxPaise },
  });
  return NextResponse.json({ mandate: current });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = request.headers.get("x-shopper-token") || undefined;
  if (token) {
    const auth = authenticateShopper(token);
    if (!auth.ok) return NextResponse.json(auth, { status: auth.status });
    return NextResponse.json({
      mandate: getMandateForSession(auth.session.id),
      budgetSet: Boolean(auth.session.budgetSet),
    });
  }
  const sessionId = url.searchParams.get("sessionId") || "";
  if (!sessionId) return NextResponse.json({ error: "sessionId or X-Shopper-Token required" }, { status: 400 });
  return NextResponse.json({ mandate: getMandateForSession(sessionId) });
}
