import { writeAudit } from "./audit";
import { spendCampaign } from "./campaigns";
import { id } from "./ids";
import { getMandateForSession, mutateCart } from "./cart";
import { explainMoney, priceCart } from "./quote";
import { createRazorpayOrder, fetchPayment, hasLiveTestKeys, getKeyId, verifyPaymentSignature } from "./razorpay";
import { getDb, getOrCreateSession, saveDb } from "./store";
import { signMandate } from "./mandate";
import type { CheckoutRecord, U402Quote } from "./types";

export async function quoteCheckout(sessionId: string): Promise<
  | { status: 402; body: U402Quote }
  | { status: 403; body: U402Quote }
  | { status: 400; body: { error: string } }
> {
  const session = getOrCreateSession(sessionId);
  if (!session.cart.length) {
    return { status: 400, body: { error: "Cart is empty." } };
  }
  const mandate = getMandateForSession(sessionId);
  const priced = priceCart(session.cart);
  const { gate, explanation } = explainMoney(mandate, priced);

  writeAudit({
    sessionId,
    type: gate.ok ? "checkout.quoted" : "checkout.blocked",
    explainable: true,
    bounded: true,
    gated: true,
    reason: explanation,
    data: {
      payablePaise: priced.payablePaise,
      remainingPaise: mandate.remainingPaise,
      code: gate.ok ? "OK" : gate.code,
    },
  });

  if (!gate.ok) {
    const body: U402Quote = {
      u402Version: 1,
      error: "mandate_exceeded",
      accepts: [],
      mandate: {
        id: mandate.id,
        maxPaise: mandate.maxPaise,
        remainingPaise: mandate.remainingPaise,
        expiresAt: mandate.expiresAt,
      },
      breakdown: {
        subtotalPaise: priced.subtotalPaise,
        discountPaise: priced.discountPaise,
        payablePaise: priced.payablePaise,
        campaignId: priced.campaignId,
        campaignName: priced.campaignName,
        lines: priced.lines,
        explanation,
      },
    };
    return { status: 403, body };
  }

  const checkoutId = id("chk");
  const receipt = checkoutId.slice(0, 40);
  const order = await createRazorpayOrder({
    amountPaise: priced.payablePaise,
    receipt,
    notes: {
      checkoutId,
      sessionId,
      mandateId: mandate.id,
      explanation: explanation.slice(0, 250),
    },
  });

  const record: CheckoutRecord = {
    id: checkoutId,
    sessionId,
    status: "quoted",
    amountPaise: priced.payablePaise,
    subtotalPaise: priced.subtotalPaise,
    discountPaise: priced.discountPaise,
    campaignId: priced.campaignId,
    orderId: order.orderId,
    explanation,
    lines: priced.lines,
    createdAt: new Date().toISOString(),
  };

  const db = getDb();
  db.checkouts[checkoutId] = record;
  session.lastCheckoutId = checkoutId;
  const quote: U402Quote = {
    u402Version: 1,
    error: "payment_required",
    accepts: [
      {
        scheme: "razorpay_order",
        network: order.network,
        amountPaise: priced.payablePaise,
        currency: "INR",
        orderId: order.orderId,
        keyId: getKeyId(),
        checkoutId,
        maxTimeoutSeconds: 300,
      },
    ],
    mandate: {
      id: mandate.id,
      maxPaise: mandate.maxPaise,
      remainingPaise: mandate.remainingPaise,
      expiresAt: mandate.expiresAt,
    },
    breakdown: {
      subtotalPaise: priced.subtotalPaise,
      discountPaise: priced.discountPaise,
      payablePaise: priced.payablePaise,
      campaignId: priced.campaignId,
      campaignName: priced.campaignName,
      lines: priced.lines,
      explanation,
    },
  };
  session.lastQuote = quote;
  saveDb();
  return { status: 402, body: quote };
}

export async function confirmCheckout(opts: {
  sessionId: string;
  checkoutId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const db = getDb();
  const record = db.checkouts[opts.checkoutId];
  if (!record || record.sessionId !== opts.sessionId) {
    return { status: 404 as const, body: { error: "Unknown checkout." } };
  }
  if (record.status === "paid") {
    return { status: 200 as const, body: { ok: true, record, idempotent: true } };
  }
  if (record.status === "failed") {
    return {
      status: 409 as const,
      body: { error: "This checkout already failed. Stop rule: no retry on the same checkout_id." },
    };
  }

  const signed = verifyPaymentSignature({
    orderId: opts.orderId,
    paymentId: opts.paymentId,
    signature: opts.signature,
  });
  if (!signed && hasLiveTestKeys()) {
    return { status: 400 as const, body: { error: "Payment signature invalid." } };
  }

  const payment = await fetchPayment(opts.paymentId);
  const status = String((payment as { status?: string }).status || "captured");
  if (status === "failed") {
    return failCheckout(opts.sessionId, opts.checkoutId, "Razorpay marked payment failed.");
  }

  record.status = "paid";
  record.paymentId = opts.paymentId;
  record.orderId = opts.orderId;
  const session = getOrCreateSession(opts.sessionId);
  const mandate = db.mandates[session.mandateId];
  if (mandate) {
    mandate.remainingPaise -= record.amountPaise;
    mandate.signature = signMandate({
      id: mandate.id,
      agentId: mandate.agentId,
      merchantId: mandate.merchantId,
      maxPaise: mandate.maxPaise,
      remainingPaise: mandate.remainingPaise,
      categories: mandate.categories,
      expiresAt: mandate.expiresAt,
      createdAt: mandate.createdAt,
    });
  }
  if (record.campaignId && record.discountPaise) {
    spendCampaign(record.campaignId, record.discountPaise);
  }
  mutateCart(opts.sessionId, "clear");
  session.lastQuote = undefined;
  saveDb();
  writeAudit({
    sessionId: opts.sessionId,
    type: "payment.captured",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Captured ${opts.paymentId} for ${opts.orderId}. ${record.explanation}`,
    data: {
      checkoutId: record.id,
      orderId: opts.orderId,
      paymentId: opts.paymentId,
      amountPaise: record.amountPaise,
    },
  });
  return { status: 200 as const, body: { ok: true, record } };
}

export function failCheckout(sessionId: string, checkoutId: string, reason: string) {
  const db = getDb();
  const record = db.checkouts[checkoutId];
  const session = getOrCreateSession(sessionId);
  if (record?.status === "paid") {
    return { status: 409 as const, body: { error: "Already paid." } };
  }
  if (record) {
    record.status = "failed";
    record.stopRule = "one_attempt_no_retry_storm";
  }
  session.declineAttempts += 1;
  saveDb();
  writeAudit({
    sessionId,
    type: "payment.failed",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `${reason} Stop rule: do not retry the same checkout. Cart left intact, no second Order.`,
    data: { checkoutId, stopRule: "one_attempt_no_retry_storm", declineAttempts: session.declineAttempts },
  });
  return {
    status: 402 as const,
    body: {
      error: "payment_failed",
      stopRule: "one_attempt_no_retry_storm",
      reason,
      checkoutId,
    },
  };
}

export function markWebhook(orderId: string, paymentId: string, ok: boolean) {
  const db = getDb();
  const record = Object.values(db.checkouts).find((c) => c.orderId === orderId);
  if (!record) return;
  if (!ok) {
    failCheckout(record.sessionId, record.id, "Webhook payment.failed");
    return;
  }
  if (record.status === "paid") return;
  record.status = "paid";
  record.paymentId = paymentId;
  const session = getOrCreateSession(record.sessionId);
  const mandate = db.mandates[session.mandateId];
  if (mandate) {
    mandate.remainingPaise -= record.amountPaise;
    mandate.signature = signMandate({
      id: mandate.id,
      agentId: mandate.agentId,
      merchantId: mandate.merchantId,
      maxPaise: mandate.maxPaise,
      remainingPaise: mandate.remainingPaise,
      categories: mandate.categories,
      expiresAt: mandate.expiresAt,
      createdAt: mandate.createdAt,
    });
  }
  if (record.campaignId && record.discountPaise) {
    spendCampaign(record.campaignId, record.discountPaise);
  }
  mutateCart(record.sessionId, "clear");
  saveDb();
  writeAudit({
    sessionId: record.sessionId,
    type: "payment.captured",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Webhook captured ${paymentId} for ${orderId}.`,
    data: { checkoutId: record.id, orderId, paymentId, amountPaise: record.amountPaise },
  });
}
