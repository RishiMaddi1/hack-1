import { NextResponse } from "next/server";
import { quoteCheckout } from "@/lib/checkout";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string };
  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const result = await quoteCheckout(body.sessionId);
  return NextResponse.json(result.body, { status: result.status });
}
