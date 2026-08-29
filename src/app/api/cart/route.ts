import { NextResponse } from "next/server";
import { getCart, getMandateForSession, mutateCart } from "@/lib/cart";
import { priceCart } from "@/lib/quote";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  const cart = getCart(sessionId);
  const mandate = getMandateForSession(sessionId);
  return NextResponse.json({ cart, priced: priceCart(cart), mandate });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    action?: "add" | "remove" | "set" | "clear";
    sku?: string;
    qty?: number;
  };
  if (!body.sessionId || !body.action) {
    return NextResponse.json({ error: "sessionId and action required" }, { status: 400 });
  }
  const cart = mutateCart(body.sessionId, body.action, body.sku, body.qty ?? 1);
  const mandate = getMandateForSession(body.sessionId);
  return NextResponse.json({ cart, priced: priceCart(cart), mandate });
}
