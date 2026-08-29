import { NextResponse } from "next/server";
import { confirmCheckout, failCheckout } from "@/lib/checkout";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    checkoutId?: string;
    orderId?: string;
    paymentId?: string;
    signature?: string;
    failed?: boolean;
    reason?: string;
  };
  if (!body.sessionId || !body.checkoutId) {
    return NextResponse.json({ error: "sessionId and checkoutId required" }, { status: 400 });
  }
  if (body.failed) {
    const result = failCheckout(body.sessionId, body.checkoutId, body.reason || "Payment declined.");
    return NextResponse.json(result.body, { status: result.status });
  }
  if (!body.orderId || !body.paymentId || !body.signature) {
    return NextResponse.json({ error: "payment fields required" }, { status: 400 });
  }
  const result = await confirmCheckout({
    sessionId: body.sessionId,
    checkoutId: body.checkoutId,
    orderId: body.orderId,
    paymentId: body.paymentId,
    signature: body.signature,
  });
  return NextResponse.json(result.body, { status: result.status });
}
