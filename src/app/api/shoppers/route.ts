import { NextResponse } from "next/server";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { loginShopper, registerShopper, setShopperBudget, extractShopperToken, authenticateShopper } from "@/lib/shoppers";
import { listMerchants } from "@/lib/merchants";

export async function GET() {
  return NextResponse.json({ merchants: listMerchants() });
}

export async function POST(request: Request) {
  const limited = rateLimit(`shoppers:${clientKey(request)}`, 40, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }
  const body = (await request.json()) as {
    action?: "register" | "login" | "set_budget" | "me";
    username?: string;
    shopperToken?: string;
    shopper_token?: string;
    merchantId?: string;
    maxRupees?: number;
    max_rupees?: number;
  };
  const token = extractShopperToken(request, body as Record<string, unknown>);

  if (body.action === "register") {
    if (!body.username) {
      return NextResponse.json({ error: "username required" }, { status: 400 });
    }
    const result = registerShopper({ username: body.username, merchantId: body.merchantId });
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === "USERNAME_TAKEN" ? 409 : 400 });
    }
    return NextResponse.json(result);
  }

  if (body.action === "login") {
    if (!body.username || !token) {
      return NextResponse.json({ error: "username and shopperToken required" }, { status: 400 });
    }
    const result = loginShopper({ username: body.username, shopperToken: token });
    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      username: result.username,
      shopperId: result.shopper.id,
      sessionId: result.session.id,
      merchantId: result.session.merchantId,
      budgetSet: Boolean(result.session.budgetSet),
    });
  }

  if (body.action === "set_budget") {
    if (!token) {
      return NextResponse.json({ error: "shopperToken required" }, { status: 401 });
    }
    const maxRupees = body.maxRupees ?? body.max_rupees;
    if (typeof maxRupees !== "number") {
      return NextResponse.json({ error: "maxRupees required" }, { status: 400 });
    }
    const result = setShopperBudget({ shopperToken: token, maxRupees });
    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      username: result.username,
      sessionId: result.session.id,
      budgetSet: true,
      mandate: result.mandate,
    });
  }

  if (body.action === "me") {
    const auth = authenticateShopper(token);
    if (!auth.ok) return NextResponse.json(auth, { status: auth.status });
    return NextResponse.json({
      ok: true,
      username: auth.username,
      shopperId: auth.shopper.id,
      sessionId: auth.session.id,
      merchantId: auth.session.merchantId,
      budgetSet: Boolean(auth.session.budgetSet),
    });
  }

  return NextResponse.json({ error: "action must be register | login | set_budget | me" }, { status: 400 });
}
