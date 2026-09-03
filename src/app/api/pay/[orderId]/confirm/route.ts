import { NextResponse } from "next/server";
import { confirmPayPage } from "@/lib/checkout";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const ORDER_ID_RE = /^order_[A-Za-z0-9_]+$/;

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId: raw } = await context.params;
  const orderId = decodeURIComponent(raw || "").trim();
  if (!ORDER_ID_RE.test(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const body = (await request.json()) as {
    payToken?: string;
    paymentId?: string;
    signature?: string;
    dismissed?: boolean;
    /** Rejected — fail must not be client-triggerable from a public pay link. */
    failed?: boolean;
  };

  const limited = rateLimit(`pay-confirm:${clientKey(request, orderId)}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  if (body.failed) {
    return NextResponse.json(
      { error: "Client cannot mark payment failed. Use Pay again or dismiss." },
      { status: 400 },
    );
  }

  if (!body.payToken) {
    return NextResponse.json({ error: "payToken required" }, { status: 400 });
  }

  const result = await confirmPayPage({
    orderId,
    payToken: body.payToken,
    paymentId: body.paymentId,
    signature: body.signature,
    dismissed: body.dismissed,
  });

  return NextResponse.json(result.body, { status: result.status });
}
