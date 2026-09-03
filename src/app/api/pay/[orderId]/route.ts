import { NextResponse } from "next/server";
import { findCheckoutByOrderId, isCheckoutPayExpired } from "@/lib/checkout";
import { getKeyId, hasLiveTestKeys } from "@/lib/razorpay";
import { id } from "@/lib/ids";
import { saveDb } from "@/lib/store";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const ORDER_ID_RE = /^order_[A-Za-z0-9_]+$/;

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const limited = rateLimit(`pay-get:${clientKey(request)}`, 40, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  const { orderId: raw } = await context.params;
  const orderId = decodeURIComponent(raw || "").trim();
  if (!ORDER_ID_RE.test(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const record = findCheckoutByOrderId(orderId);
  if (!record) {
    return NextResponse.json({ error: "Unknown or expired order" }, { status: 404 });
  }

  if (record.status === "paid") {
    return NextResponse.json({
      orderId: record.orderId,
      status: "paid",
      amountPaise: record.amountPaise,
      currency: "INR",
      explanation: record.explanation,
      lines: record.lines,
    });
  }

  if (isCheckoutPayExpired(record)) {
    return NextResponse.json({ error: "This pay link has expired. Ask the agent to quote again." }, { status: 410 });
  }

  if (!record.payToken) {
    record.payToken = id("ptk");
    saveDb();
  }

  // Intentionally omit sessionId — prevents failCheckout DoS via /api/checkout/confirm.
  return NextResponse.json({
    orderId: record.orderId,
    checkoutId: record.id,
    payToken: record.payToken,
    status: record.status,
    amountPaise: record.amountPaise,
    currency: "INR",
    keyId: getKeyId(),
    network: hasLiveTestKeys() ? "razorpay_test" : "razorpay_mock",
    explanation: record.explanation,
    lines: record.lines,
  });
}
