import { NextResponse } from "next/server";
import { runBuyerAgent, type ChatTurn } from "@/lib/agent";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { authenticateShopper, extractShopperToken, requireBudget } from "@/lib/shoppers";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    text?: string;
    shopperToken?: string;
    history?: ChatTurn[];
  };
  const token = extractShopperToken(request, body as Record<string, unknown>);
  let sessionId = body.sessionId || "";

  if (token) {
    const auth = authenticateShopper(token);
    if (!auth.ok) return NextResponse.json(auth, { status: auth.status });
    const budget = requireBudget(auth.session);
    if (budget) return NextResponse.json(budget, { status: budget.status });
    sessionId = auth.session.id;
  }

  if (!sessionId || !body.text?.trim()) {
    return NextResponse.json({ error: "sessionId (or shopperToken) and text required" }, { status: 400 });
  }
  const limited = rateLimit(`chat:${clientKey(request, sessionId)}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }
  if (body.text.length > 2000) {
    return NextResponse.json({ error: "Message too long." }, { status: 400 });
  }
  const history = Array.isArray(body.history) ? body.history.slice(-16) : [];
  const message = await runBuyerAgent(sessionId, body.text, history);
  return NextResponse.json({ message });
}
