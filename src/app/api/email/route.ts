import { NextResponse } from "next/server";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { emailStatusForShopper, requestEmailOtp, verifyEmailOtp } from "@/lib/email-otp";
import { authenticateShopper, extractShopperToken } from "@/lib/shoppers";

export async function POST(request: Request) {
  const limited = rateLimit(`email:${clientKey(request)}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  const body = (await request.json()) as {
    action?: "status" | "request_otp" | "verify_otp";
    email?: string;
    code?: string;
    shopperToken?: string;
    shopper_token?: string;
  };
  const token = extractShopperToken(request, body as Record<string, unknown>);

  if (body.action === "status") {
    const auth = authenticateShopper(token);
    if (!auth.ok) return NextResponse.json(auth, { status: auth.status });
    return NextResponse.json({ ok: true, ...emailStatusForShopper(auth.shopper.id) });
  }

  if (body.action === "request_otp") {
    if (!token || !body.email) {
      return NextResponse.json({ error: "shopperToken and email required" }, { status: 400 });
    }
    const result = await requestEmailOtp({ shopperToken: token, email: body.email });
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    return NextResponse.json(result);
  }

  if (body.action === "verify_otp") {
    if (!token || !body.code) {
      return NextResponse.json({ error: "shopperToken and code required" }, { status: 400 });
    }
    const result = verifyEmailOtp({ shopperToken: token, code: body.code });
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "action must be status | request_otp | verify_otp" }, { status: 400 });
}
