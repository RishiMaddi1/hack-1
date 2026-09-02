import { NextResponse } from "next/server";
import { runBuyerAgent } from "@/lib/agent";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string; text?: string };
  if (!body.sessionId || !body.text?.trim()) {
    return NextResponse.json({ error: "sessionId and text required" }, { status: 400 });
  }
  const limited = rateLimit(`chat:${clientKey(request, body.sessionId)}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }
  if (body.text.length > 2000) {
    return NextResponse.json({ error: "Message too long." }, { status: 400 });
  }
  const message = await runBuyerAgent(body.sessionId, body.text);
  return NextResponse.json({ message });
}
