import { NextResponse } from "next/server";
import { getMandateForSession } from "@/lib/cart";
import { getDb, getOrCreateSession, saveDb } from "@/lib/store";
import { issueMandate } from "@/lib/mandate-signer";
import { writeAudit } from "@/lib/audit";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MIN_MANDATE_PAISE = 100_00; // ₹100
const MAX_MANDATE_PAISE = 500_000_00; // ₹5,00,000

/**
 * Buyer signing authority surface. Merchant gate verifies with the public key only.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    maxPaise?: number;
    expiresAt?: string;
  };
  if (!body.sessionId || !body.maxPaise) {
    return NextResponse.json({ error: "sessionId and maxPaise required" }, { status: 400 });
  }
  const limited = rateLimit(`mandate:${clientKey(request, body.sessionId)}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
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
  writeAudit({
    sessionId: body.sessionId,
    type: "mandate.updated",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Human re-authorised via buyer signer at ₹${body.maxPaise / 100} with full remaining.`,
    data: { mandateId: current.id, kid: current.kid },
  });
  return NextResponse.json({ mandate: current });
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  return NextResponse.json({ mandate: getMandateForSession(sessionId) });
}
