import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getDb, getOrCreateSession, saveDb } from "@/lib/store";
import { verifyMandate, gateCart, auditMandateVerify } from "@/lib/mandate";
import { issueMandate } from "@/lib/mandate-signer";
import { writeAudit } from "@/lib/audit";
import { priceCart } from "@/lib/quote";
import { getMandateForSession } from "@/lib/cart";
import { verifyWebhookSignature } from "@/lib/razorpay";

/**
 * Adversarial + expiry demos for the panel. All attacks must fail closed.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    attack?: "forge_remaining" | "replay_stale" | "expire_now" | "bad_webhook";
  };
  if (!body.sessionId || !body.attack) {
    return NextResponse.json({ error: "sessionId and attack required" }, { status: 400 });
  }

  const session = getOrCreateSession(body.sessionId);
  const db = getDb();
  const mandate = db.mandates[session.mandateId];
  if (!mandate) {
    return NextResponse.json({ error: "No mandate" }, { status: 404 });
  }

  if (body.attack === "forge_remaining") {
    const forged = {
      ...mandate,
      remainingPaise: mandate.maxPaise * 10,
      // keep old signature — tampered claims
    };
    const ok = verifyMandate(forged);
    auditMandateVerify(body.sessionId, forged, ok);
    const priced = priceCart(session.cart.length ? session.cart : [{ sku: "chimera-wireless-gaming-mouse", qty: 1 }]);
    const gate = gateCart(forged, priced.products, priced.payablePaise);
    writeAudit({
      sessionId: body.sessionId,
      type: "lab.forge_remaining",
      explainable: true,
      bounded: true,
      gated: true,
      reason: ok
        ? "UNEXPECTED: forged remaining verified — keys misconfigured."
        : `Forged remainingPaise to ₹${forged.remainingPaise / 100} without buyer re-sign. Signature check failed. No Order.`,
      data: { ok, gate },
    });
    return NextResponse.json({
      attack: body.attack,
      blocked: !ok || !gate.ok,
      verifyOk: ok,
      gate,
      message: "Tampering remaining without buyer signature is rejected.",
    });
  }

  if (body.attack === "replay_stale") {
    const stale = { ...mandate };
    // Lower the live mandate, keep stale copy with old signature/high remaining
    const lowered = issueMandate({
      id: mandate.id,
      agentId: mandate.agentId,
      merchantId: mandate.merchantId,
      maxPaise: 200000,
      remainingPaise: 200000,
      categories: mandate.categories,
      expiresAt: mandate.expiresAt,
      createdAt: mandate.createdAt,
    });
    Object.assign(mandate, lowered);
    saveDb();

    const replayOk = verifyMandate(stale);
    // Stale still has valid signature for old claims — but merchant must use current session mandate
    const current = getMandateForSession(body.sessionId);
    const usingStale = stale.remainingPaise !== current.remainingPaise;
    writeAudit({
      sessionId: body.sessionId,
      type: "lab.replay_stale",
      explainable: true,
      bounded: true,
      gated: true,
      reason: usingStale
        ? `Replay rejected: session binds mandate ${current.id} at ₹${current.remainingPaise / 100} left. Stale artifact with ₹${stale.remainingPaise / 100} is not the live mandate.`
        : "Replay check inconclusive.",
      data: {
        staleRemaining: stale.remainingPaise,
        liveRemaining: current.remainingPaise,
        staleSigStillValidForOldClaims: replayOk,
      },
    });
    return NextResponse.json({
      attack: body.attack,
      blocked: true,
      staleSigStillValidForOldClaims: replayOk,
      liveMandate: {
        remainingPaise: current.remainingPaise,
        maxPaise: current.maxPaise,
      },
      message: "Merchant uses the live session mandate only — replaying an old high-cap artifact does not raise the cap.",
    });
  }

  if (body.attack === "expire_now") {
    const expired = issueMandate({
      id: mandate.id,
      agentId: mandate.agentId,
      merchantId: mandate.merchantId,
      maxPaise: mandate.maxPaise,
      remainingPaise: mandate.remainingPaise,
      categories: mandate.categories,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: mandate.createdAt,
    });
    Object.assign(mandate, expired);
    saveDb();
    const priced = priceCart(session.cart.length ? session.cart : [{ sku: "harpy-black-light-weight-rgb-gaming-mouse", qty: 1 }]);
    const gate = gateCart(mandate, priced.products, Math.min(priced.payablePaise, mandate.remainingPaise), body.sessionId);
    writeAudit({
      sessionId: body.sessionId,
      type: "mandate.expired",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Mandate ${mandate.id} expired mid-session. Gate: ${gate.reason}`,
      data: { expiresAt: mandate.expiresAt, gate },
    });
    return NextResponse.json({
      attack: body.attack,
      blocked: !gate.ok,
      gate,
      mandate: { id: mandate.id, expiresAt: mandate.expiresAt },
      message: "Expired mandate blocks checkout. Re-authorise (pick a cap in Cart) to get a fresh signed mandate.",
    });
  }

  if (body.attack === "bad_webhook") {
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_fake", order_id: "order_fake" } } } });
    const badSig = createHmac("sha256", "wrong-secret").update(raw).digest("hex");
    const ok = verifyWebhookSignature(raw, badSig);
    writeAudit({
      sessionId: body.sessionId,
      type: "lab.bad_webhook",
      explainable: true,
      bounded: true,
      gated: true,
      reason: ok
        ? "UNEXPECTED: bad webhook signature accepted."
        : "Webhook with wrong HMAC rejected (would be HTTP 400). Signature is load-bearing.",
      data: { accepted: ok },
    });
    return NextResponse.json({
      attack: body.attack,
      blocked: !ok,
      message: "Invalid Razorpay webhook signature is rejected.",
    });
  }

  return NextResponse.json({ error: "Unknown attack" }, { status: 400 });
}
