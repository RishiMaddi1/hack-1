import { NextResponse } from "next/server";
import { getMandateForSession } from "@/lib/cart";
import { getDb, getOrCreateSession, saveDb } from "@/lib/store";
import { signMandate } from "@/lib/mandate";
import { writeAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  return NextResponse.json({ mandate: getMandateForSession(sessionId) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string; maxPaise?: number };
  if (!body.sessionId || !body.maxPaise) {
    return NextResponse.json({ error: "sessionId and maxPaise required" }, { status: 400 });
  }
  const session = getOrCreateSession(body.sessionId);
  const db = getDb();
  const current = db.mandates[session.mandateId];
  const spent = current.maxPaise - current.remainingPaise;
  current.maxPaise = body.maxPaise;
  current.remainingPaise = Math.max(0, body.maxPaise - spent);
  current.signature = signMandate({
    id: current.id,
    agentId: current.agentId,
    merchantId: current.merchantId,
    maxPaise: current.maxPaise,
    remainingPaise: current.remainingPaise,
    categories: current.categories,
    expiresAt: current.expiresAt,
    createdAt: current.createdAt,
  });
  saveDb();
  writeAudit({
    sessionId: body.sessionId,
    type: "mandate.updated",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Human re-signed mandate at ₹${body.maxPaise / 100}.`,
    data: { mandate: current },
  });
  return NextResponse.json({ mandate: current });
}
