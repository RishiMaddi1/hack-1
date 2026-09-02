import { NextResponse } from "next/server";
import { listAudit, verifyAuditChain } from "@/lib/audit";
import { getProduct } from "@/lib/catalog";
import { getDb } from "@/lib/store";
import type { AuditEvent, GrowthRow } from "@/lib/types";

function avg(rows: GrowthRow[]) {
  return rows.length ? Math.round(rows.reduce((s, r) => s + r.aovPaise, 0) / rows.length) : 0;
}

export function GET() {
  const db = getDb();
  const events = listAudit(200);
  const live = db.growth.filter((g) => g.source === "live");
  const seed = db.growth.filter((g) => g.source !== "live");
  const primary = live.length ? live : seed;
  const withUpsell = primary.filter((g) => g.withUpsell);
  const without = primary.filter((g) => !g.withUpsell);

  const cartAdds = new Map<string, { sku: string; name: string; count: number }>();
  for (const e of events) {
    if (e.type !== "cart.add") continue;
    const sku = String(e.data?.sku || "");
    if (!sku) continue;
    const name = getProduct(sku)?.name || sku;
    const prev = cartAdds.get(sku);
    cartAdds.set(sku, { sku, name, count: (prev?.count || 0) + 1 });
  }

  const checkouts = Object.values(db.checkouts);
  const paid = checkouts.filter((c) => c.status === "paid");
  const failed = checkouts.filter((c) => c.status === "failed");
  const openQuotes = checkouts.filter((c) => c.status === "quoted");
  const blocked = checkouts.filter((c) => c.status === "blocked");

  const sessionsWithCart = Object.values(db.sessions).filter((s) => s.cart.length > 0);
  const paidSessionIds = new Set(paid.map((c) => c.sessionId));
  const abandoned = sessionsWithCart
    .filter((s) => !paidSessionIds.has(s.id))
    .map((s) => ({
      sessionId: s.id,
      shopperId: s.shopperId,
      lines: s.cart.map((l) => ({
        sku: l.sku,
        qty: l.qty,
        name: getProduct(l.sku)?.name || l.sku,
      })),
      lineCount: s.cart.reduce((n, l) => n + l.qty, 0),
    }));

  const bySession = new Map<string, AuditEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.sessionId) || [];
    list.push(e);
    bySession.set(e.sessionId, list);
  }

  return NextResponse.json({
    events,
    chain: verifyAuditChain(),
    growth: {
      sessions: primary,
      liveCount: live.length,
      seedCount: seed.length,
      usingLive: live.length > 0,
      aovWithoutUpsell: avg(without),
      aovWithUpsell: avg(withUpsell),
      liftPaise: avg(withUpsell) - avg(without),
    },
    merchant: {
      cartAdds: [...cartAdds.values()].sort((a, b) => b.count - a.count),
      paymentsPaid: paid.map((c) => ({
        id: c.id,
        sessionId: c.sessionId,
        amountPaise: c.amountPaise,
        orderId: c.orderId,
        lines: c.lines,
        at: c.createdAt,
      })),
      paymentsFailed: failed.map((c) => ({
        id: c.id,
        sessionId: c.sessionId,
        amountPaise: c.amountPaise,
        orderId: c.orderId,
        lines: c.lines,
        at: c.createdAt,
      })),
      openQuotes: openQuotes.map((c) => ({
        id: c.id,
        sessionId: c.sessionId,
        amountPaise: c.amountPaise,
        orderId: c.orderId,
        lines: c.lines,
        at: c.createdAt,
      })),
      blockedCheckouts: blocked.map((c) => ({
        id: c.id,
        sessionId: c.sessionId,
        amountPaise: c.amountPaise,
        at: c.createdAt,
      })),
      abandonedCarts: abandoned,
      sessions: [...bySession.entries()].map(([sessionId, evs]) => ({
        sessionId,
        eventCount: evs.length,
        lastAt: evs[0]?.at,
      })),
    },
  });
}
