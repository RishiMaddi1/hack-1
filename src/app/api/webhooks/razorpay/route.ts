import { NextResponse } from "next/server";
import { markWebhook } from "@/lib/checkout";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { writeAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  const event = JSON.parse(raw) as {
    event?: string;
    payload?: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          status?: string;
          notes?: Record<string, string>;
        };
      };
      payment_link?: {
        entity?: {
          id?: string;
          notes?: Record<string, string>;
          order_id?: string;
        };
      };
    };
  };
  const payment = event.payload?.payment?.entity;
  const link = event.payload?.payment_link?.entity;
  const notes = payment?.notes || link?.notes || {};
  writeAudit({
    sessionId: notes.sessionId || "webhook",
    type: event.event || "webhook",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Razorpay webhook ${event.event}`,
    data: {
      paymentId: payment?.id,
      orderId: payment?.order_id || link?.order_id || notes.orderId,
      checkoutId: notes.checkoutId,
    },
  });
  const orderId = payment?.order_id || link?.order_id || notes.orderId || "";
  const paymentId = payment?.id || "";
  if (paymentId && (orderId || notes.checkoutId)) {
    markWebhook(orderId, paymentId, event.event === "payment.captured" || event.event === "payment_link.paid", {
      checkoutId: notes.checkoutId,
      sessionId: notes.sessionId,
    });
  }
  return NextResponse.json({ ok: true });
}
