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
    payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } };
  };
  const payment = event.payload?.payment?.entity;
  writeAudit({
    sessionId: "webhook",
    type: event.event || "webhook",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Razorpay webhook ${event.event}`,
    data: { paymentId: payment?.id, orderId: payment?.order_id },
  });
  if (payment?.order_id && payment.id) {
    markWebhook(payment.order_id, payment.id, event.event === "payment.captured");
  }
  return NextResponse.json({ ok: true });
}
