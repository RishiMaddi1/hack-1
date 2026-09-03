import { NextResponse } from "next/server";
import { listAudit, repairAuditChain, verifyAuditChain } from "@/lib/audit";
import { getProduct } from "@/lib/catalog";
import { getDb } from "@/lib/store";
import type { AuditEvent, GrowthRow } from "@/lib/types";

function avg(rows: GrowthRow[]) {
  return rows.length ? Math.round(rows.reduce((s, r) => s + r.aovPaise, 0) / rows.length) : 0;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  if (user.length <= 2) return `${user[0] || "*"}…@${domain}`;
  return `${user.slice(0, 2)}…@${domain}`;
}

function emailMetaForSession(db: ReturnType<typeof getDb>, sessionId: string) {
  const session = db.sessions[sessionId];
  const shopper =
    (session?.shopperId && db.shoppers[session.shopperId]) ||
    Object.values(db.shoppers).find((s) => s.sessionId === sessionId);
  if (!shopper) {
    return {
      canEmail: false as const,
      emailStatus: "no_shopper" as const,
      emailMasked: null as string | null,
      username: null as string | null,
      abandonedEmailSentAt: null as string | null,
    };
  }
  if (!shopper.emailVerified || !shopper.email) {
    return {
      canEmail: false as const,
      emailStatus: "no_email" as const,
      emailMasked: null as string | null,
      username: shopper.username,
      abandonedEmailSentAt: shopper.abandonedEmailSentAt || null,
    };
  }
  return {
    canEmail: true as const,
    emailStatus: shopper.abandonedEmailSentAt ? ("sent" as const) : ("ready" as const),
    emailMasked: maskEmail(shopper.email),
    username: shopper.username,
    abandonedEmailSentAt: shopper.abandonedEmailSentAt || null,
  };
}

function snapshotForSession(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  auditBySession: Map<string, AuditEvent[]>,
) {
  const session = db.sessions[sessionId];
  const checkouts = Object.values(db.checkouts)
    .filter((c) => c.sessionId === sessionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((c) => ({
      id: c.id,
      status: c.status,
      amountPaise: c.amountPaise,
      orderId: c.orderId,
      lines: c.lines,
      at: c.createdAt,
      explanation: c.explanation,
    }));
  const mandate = session ? db.mandates[session.mandateId] : undefined;
  const email = emailMetaForSession(db, sessionId);
  const unpaidCart = Boolean(session?.cart.length) && !checkouts.some((c) => c.status === "paid");
  return {
    sessionId,
    shopperId: session?.shopperId,
    cartTouchedAt: session?.cartTouchedAt,
    acceptedUpsell: session?.acceptedUpsell,
    cart: (session?.cart || []).map((l) => ({
      sku: l.sku,
      qty: l.qty,
      name: getProduct(l.sku)?.name || l.sku,
    })),
    mandate: mandate
      ? {
          id: mandate.id,
          maxPaise: mandate.maxPaise,
          remainingPaise: mandate.remainingPaise,
          expiresAt: mandate.expiresAt,
        }
      : null,
    checkouts,
    auditEventCount: auditBySession.get(sessionId)?.length || 0,
    /** True when the hash-chain ring dropped this session's trail but cart/checkout still exist. */
    auditRotated:
      (auditBySession.get(sessionId)?.length || 0) === 0 &&
      Boolean(session?.cart.length || checkouts.length),
    leftCart: unpaidCart,
    ...email,
  };
}

export function GET() {
  const db = getDb();
  // Full in-memory ring (capped in writeAudit) — not a short slice, or session drill-down goes blank.
  const events = listAudit(db.audit.length || 400);
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
    .map((s) => {
      const email = emailMetaForSession(db, s.id);
      return {
        sessionId: s.id,
        shopperId: s.shopperId,
        lines: s.cart.map((l) => ({
          sku: l.sku,
          qty: l.qty,
          name: getProduct(l.sku)?.name || l.sku,
        })),
        lineCount: s.cart.reduce((n, l) => n + l.qty, 0),
        ...email,
      };
    });

  const bySession = new Map<string, AuditEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.sessionId) || [];
    list.push(e);
    bySession.set(e.sessionId, list);
  }

  const snapshotIds = new Set<string>([
    ...abandoned.map((a) => a.sessionId),
    ...paid.map((c) => c.sessionId),
    ...failed.map((c) => c.sessionId),
    ...openQuotes.map((c) => c.sessionId),
    ...blocked.map((c) => c.sessionId),
  ]);
  const sessionSnapshots: Record<string, ReturnType<typeof snapshotForSession>> = {};
  for (const sid of snapshotIds) {
    sessionSnapshots[sid] = snapshotForSession(db, sid, bySession);
  }

  let chain = verifyAuditChain();
  if (!chain.ok) {
    // In-memory store can outlive a disk reseal (next dev HMR). Heal then re-check.
    repairAuditChain();
    chain = verifyAuditChain();
  }

  return NextResponse.json({
    events,
    sessionSnapshots,
    chain,
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
