import { NextResponse } from "next/server";
import { runBuyerAgent } from "@/lib/agent";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string; text?: string };
  if (!body.sessionId || !body.text?.trim()) {
    return NextResponse.json({ error: "sessionId and text required" }, { status: 400 });
  }
  const message = await runBuyerAgent(body.sessionId, body.text);
  return NextResponse.json({ message });
}
