import { writeAudit } from "./audit";
import { spendCampaign } from "./campaigns";
import { id } from "./ids";
import { getMandateForSession, mutateCart } from "./cart";
import { explainMoney, priceCart } from "./quote";
import { createRazorpayOrder, fetchPayment, hasLiveTestKeys, getKeyId, verifyPaymentSignature } from "./razorpay";
import { circuitPayUrl } from "./public-origin";
import { getDb, getOrCreateSession, saveDb } from "./store";
import { issueMandate } from "./mandate-signer";
import { buildNegotiate } from "./negotiate";
import type { CheckoutRecord, Mandate, U402Quote } from "./types";

function resignMandate(mandate: Mandate, sessionId: string): Mandate {
  const next = issueMandate({
    id: mandate.id,
    agentId: mandate.agentId,
    merchantId: mandate.merchantId,
    maxPaise: mandate.maxPaise,
    remainingPaise: mandate.remainingPaise,
    categories: mandate.categories,
    expiresAt: mandate.expiresAt,
    createdAt: mandate.createdAt,
  });
  Object.assign(mandate, next);
  writeAudit({
    sessionId,
    type: "mandate.signed",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Buyer authority re-signed mandate ${mandate.id} after spend (remaining ₹${mandate.remainingPaise / 100}).`,
    data: { mandateId: mandate.id, remainingPaise: mandate.remainingPaise },
  });
  return mandate;
}

function recordLiveGrowth(sessionId: string, amountPaise: number, withUpsell: boolean) {
  const db = getDb();
  db.growth.unshift({
    id: id("grw"),
    withUpsell,
    aovPaise: amountPaise,
    recovered: true,
    source: "live",
    sessionId,
    at: new Date().toISOString(),
  });
}

function blockedError(
  code: string,
): U402Quote["error"] {
  if (code === "MANDATE_EXPIRED") return "mandate_expired";
  if (code === "MANDATE_BAD_SIGNATURE") return "mandate_bad_signature";
  return "mandate_exceeded";
}

export async function quoteCheckout(sessionId: string): Promise<
  | { status: 402; body: U402Quote }
  | { status: 403; body: U402Quote }
  | { status: 400; body: { error: string } }
  | { status: 403; body: { error: string; message: string } }
> {
  const session = getOrCreateSession(sessionId);
  if (session.shopperId && !session.budgetSet) {
    return {
      status: 403,
      body: { error: "BUDGET_REQUIRED", message: "Call set_budget before shopping (cart / checkout)." },
    };
  }
  if (!session.cart.length) {
    return { status: 400, body: { error: "Cart is empty." } };
  }
  const mandate = getMandateForSession(sessionId);
  const priced = priceCart(session.cart);
  const { gate, explanation } = explainMoney(mandate, priced, sessionId);

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
    const negotiate =
      gate.code === "MANDATE_EXCEEDED"
        ? buildNegotiate(mandate, priced.lines, priced.payablePaise)
        : undefined;
    const body: U402Quote = {
      u402Version: 1,
      error: blockedError(gate.code),
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
      negotiate,
    };
    return { status: 403, body };
  }

  const checkoutId = id("chk");
  const receipt = checkoutId.slice(0, 40);
  let order: { orderId: string; network: "razorpay_test" | "razorpay_mock" };
  try {
    order = await createRazorpayOrder({
      amountPaise: priced.payablePaise,
      receipt,
      notes: {
        checkoutId,
        sessionId,
        mandateId: mandate.id,
        explanation: explanation.slice(0, 250),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[checkout] createRazorpayOrder failed", msg);
    writeAudit({
      sessionId,
      type: "checkout.blocked",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Razorpay Order create failed: ${msg}`,
      data: { payablePaise: priced.payablePaise },
    });
    return { status: 400, body: { error: `Razorpay Order failed: ${msg.slice(0, 160)}` } };
  }

  const record: CheckoutRecord = {
    id: checkoutId,
    sessionId,
    status: "quoted",
    amountPaise: priced.payablePaise,
    subtotalPaise: priced.subtotalPaise,
    discountPaise: priced.discountPaise,
    campaignId: priced.campaignId,
    orderId: order.orderId,
    payToken: id("ptk"),
    explanation,
    lines: priced.lines,
    createdAt: new Date().toISOString(),
  };

  const db = getDb();
  db.checkouts[checkoutId] = record;
  session.lastCheckoutId = checkoutId;
  // Circuit-hosted Checkout.js page (avoids Razorpay test Payment Link cap of 30).
  const linkUrl = circuitPayUrl(order.orderId);
  const quote: U402Quote = {
    u402Version: 1,
    error: "payment_required",
    paymentLinkUrl: linkUrl,
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
        paymentLinkUrl: linkUrl,
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
  if (record.orderId && record.orderId !== opts.orderId) {
    return { status: 400 as const, body: { error: "orderId does not match checkout." } };
  }
  if (record.status === "paid") {
    return { status: 200 as const, body: { ok: true, record, idempotent: true } };
  }
  // status "failed" is still capturable if Razorpay signature verifies (pay-again / late success).

  const signed = verifyPaymentSignature({
    orderId: opts.orderId,
    paymentId: opts.paymentId,
    signature: opts.signature,
  });
  if (!signed && hasLiveTestKeys()) {
    return { status: 400 as const, body: { error: "Payment signature invalid." } };
  }

  const payment = await fetchPayment(opts.paymentId);
  // Re-check after await — webhook may have won the race while we talked to Razorpay.
  const again = getDb().checkouts[opts.checkoutId];
  if (!again || again.status === "paid") {
    writeAudit({
      sessionId: opts.sessionId,
      type: "payment.capture_race",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Client confirm lost the race to webhook for ${opts.orderId}. Mandate already spent once — no double debit.`,
      data: { checkoutId: opts.checkoutId, orderId: opts.orderId, paymentId: opts.paymentId },
    });
    return { status: 200 as const, body: { ok: true, record: again, idempotent: true, raced: true } };
  }

  const status = String((payment as { status?: string }).status || "captured");
  if (status === "failed") {
    return failCheckout(opts.sessionId, opts.checkoutId, "Razorpay marked payment failed.");
  }

  const paidAmount = Number((payment as { amount?: number }).amount);
  if (Number.isFinite(paidAmount) && paidAmount > 0 && paidAmount !== again.amountPaise) {
    return {
      status: 400 as const,
      body: { error: "Payment amount does not match checkout." },
    };
  }

  applyCapture(again, opts.paymentId, opts.orderId, "client");
  return { status: 200 as const, body: { ok: true, record: again } };
}

export function findCheckoutByOrderId(orderId: string): CheckoutRecord | undefined {
  return Object.values(getDb().checkouts).find((c) => c.orderId === orderId);
}

/** Public /pay handoff — capture or soft-dismiss without trusting a client sessionId. */
export async function confirmPayPage(opts: {
  orderId: string;
  payToken: string;
  paymentId?: string;
  signature?: string;
  dismissed?: boolean;
}) {
  const record = findCheckoutByOrderId(opts.orderId);
  if (!record?.orderId || !record.payToken) {
    return { status: 404 as const, body: { error: "Unknown or expired order" } };
  }
  if (record.payToken !== opts.payToken) {
    return { status: 403 as const, body: { error: "Invalid pay token" } };
  }
  if (opts.dismissed) {
    return dismissCheckout(record.sessionId, record.id);
  }
  if (!opts.paymentId || !opts.signature) {
    return { status: 400 as const, body: { error: "payment fields required" } };
  }
  return confirmCheckout({
    sessionId: record.sessionId,
    checkoutId: record.id,
    orderId: record.orderId,
    paymentId: opts.paymentId,
    signature: opts.signature,
  });
}

/** Soft age-out for handoff links (Razorpay order maxTimeoutSeconds ≈ 300). */
export function isCheckoutPayExpired(record: CheckoutRecord, maxAgeMs = 30 * 60_000): boolean {
  const created = Date.parse(record.createdAt);
  if (!Number.isFinite(created)) return false;
  return Date.now() - created > maxAgeMs;
}

/** Single writer for paid side-effects — client confirm and webhook both call this. */
function applyCapture(
  record: CheckoutRecord,
  paymentId: string,
  orderId: string,
  source: "client" | "webhook",
) {
  if (record.status === "paid") return false;
  record.status = "paid";
  record.paymentId = paymentId;
  record.orderId = orderId;
  const db = getDb();
  const session = getOrCreateSession(record.sessionId);
  const mandate = db.mandates[session.mandateId];
  if (mandate) {
    mandate.remainingPaise -= record.amountPaise;
    resignMandate(mandate, record.sessionId);
  }
  if (record.campaignId && record.discountPaise) {
    spendCampaign(record.campaignId, record.discountPaise);
  }
  recordLiveGrowth(record.sessionId, record.amountPaise, Boolean(session.acceptedUpsell));
  session.acceptedUpsell = false;
  mutateCart(record.sessionId, "clear");
  session.lastQuote = undefined;
  saveDb();
  writeAudit({
    sessionId: record.sessionId,
    type: "payment.captured",
    explainable: true,
    bounded: true,
    gated: true,
    reason:
      source === "webhook"
        ? `Webhook captured ${paymentId} for ${orderId}.`
        : `Captured ${paymentId} for ${orderId}. ${record.explanation}`,
    data: {
      checkoutId: record.id,
      orderId,
      paymentId,
      amountPaise: record.amountPaise,
      source,
    },
  });
  return true;
}

export function dismissCheckout(sessionId: string, checkoutId: string) {
  const db = getDb();
  const record = db.checkouts[checkoutId];
  if (!record || record.sessionId !== sessionId) {
    return { status: 404 as const, body: { error: "Unknown checkout." } };
  }
  if (record.status === "paid" || record.status === "failed") {
    return { status: 200 as const, body: { ok: true, record, skipped: true } };
  }
  writeAudit({
    sessionId,
    type: "checkout.dismissed",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Human closed Razorpay before paying. Checkout ${checkoutId} / ${record.orderId} left quoted — cart intact, no capture. Say pay again for a fresh Order.`,
    data: { checkoutId, orderId: record.orderId, amountPaise: record.amountPaise },
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

export function markWebhook(
  orderId: string,
  paymentId: string,
  ok: boolean,
  extras?: { checkoutId?: string; sessionId?: string },
) {
  const db = getDb();
  let record = Object.values(db.checkouts).find((c) => c.orderId === orderId);
  if (!record && extras?.checkoutId) {
    record = db.checkouts[extras.checkoutId];
  }
  if (!record && extras?.sessionId) {
    record = Object.values(db.checkouts)
      .filter((c) => c.sessionId === extras.sessionId && c.status === "quoted")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }
  if (!record) return;
  if (!ok) {
    failCheckout(record.sessionId, record.id, "Webhook payment.failed");
    return;
  }
  applyCapture(record, paymentId, orderId || record.orderId || paymentId, "webhook");
}

/** Lab: simulate client+webhook both trying to capture — mandate must debit once. */
export function simulateDoubleCapture(sessionId: string) {
  const db = getDb();
  const session = getOrCreateSession(sessionId);
  const remainingBefore = db.mandates[session.mandateId]?.remainingPaise ?? 0;
  const checkoutId = id("chk");
  const orderId = `order_race_${checkoutId.slice(4, 12)}`;
  const amountPaise = 59900;
  const record: CheckoutRecord = {
    id: checkoutId,
    sessionId,
    status: "quoted",
    amountPaise,
    subtotalPaise: amountPaise,
    discountPaise: 0,
    orderId,
    explanation: "Lab race: Harpy @ ₹599 — client confirm vs webhook.",
    lines: [
      {
        sku: "harpy-black-light-weight-rgb-gaming-mouse",
        name: "Harpy White Light Weight RGB Gaming Mouse",
        qty: 1,
        unitPaise: amountPaise,
        linePaise: amountPaise,
      },
    ],
    createdAt: new Date().toISOString(),
  };
  db.checkouts[checkoutId] = record;
  saveDb();

  // Webhook wins first (common in production).
  const first = applyCapture(record, `pay_race_${checkoutId.slice(4, 10)}`, orderId, "webhook");
  // Client confirm path after await would see paid — second apply must no-op.
  const second = applyCapture(record, `pay_race_${checkoutId.slice(4, 10)}`, orderId, "client");
  const remainingAfter = db.mandates[session.mandateId]?.remainingPaise ?? 0;
  const spent = remainingBefore - remainingAfter;
  const audit = writeAudit({
    sessionId,
    type: "lab.double_capture",
    explainable: true,
    bounded: true,
    gated: true,
    reason:
      spent === amountPaise && first && !second
        ? `Race survived: webhook + client both fired; mandate debited once (−₹${amountPaise / 100}). Remaining ${remainingAfter / 100}.`
        : `Race check unexpected: spent ₹${spent / 100}, first=${first}, second=${second}.`,
    data: { remainingBefore, remainingAfter, spent, first, second, checkoutId, orderId },
  });
  return {
    blocked: spent === amountPaise && !second,
    remainingBefore,
    remainingAfter,
    spent,
    amountPaise,
    checkoutId,
    orderId,
    firstApplied: first,
    secondApplied: second,
    auditId: audit.id,
    message:
      spent === amountPaise && !second
        ? "Webhook and client both fired. Mandate only dropped once."
        : "Double-capture race did not stay single-debit — check applyCapture.",
  };
}
