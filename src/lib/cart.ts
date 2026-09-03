import { writeAudit } from "./audit";
import { getProduct } from "./catalog";
import { getDb, getOrCreateSession, saveDb } from "./store";
import type { CartLine } from "./types";

export function getCart(sessionId: string): CartLine[] {
  return getOrCreateSession(sessionId).cart;
}

export function mutateCart(
  sessionId: string,
  action: "add" | "remove" | "set" | "clear",
  sku?: string,
  qty = 1,
) {
  const session = getOrCreateSession(sessionId);
  const product = sku ? getProduct(sku) : undefined;
  if (action !== "clear" && sku && !product) {
    throw new Error(`Unknown SKU ${sku}`);
  }

  if (action === "clear") {
    session.cart = [];
  } else if (action === "add" && sku) {
    if (session.cart.some((l) => getProduct(l.sku)?.upsellSku === sku)) {
      session.acceptedUpsell = true;
    }
    const line = session.cart.find((l) => l.sku === sku);
    if (line) line.qty += qty;
    else session.cart.push({ sku, qty });
  } else if (action === "remove" && sku) {
    session.cart = session.cart.filter((l) => l.sku !== sku);
  } else if (action === "set" && sku) {
    if (qty <= 0) session.cart = session.cart.filter((l) => l.sku !== sku);
    else {
      const line = session.cart.find((l) => l.sku === sku);
      if (line) line.qty = qty;
      else session.cart.push({ sku, qty });
    }
  }

  session.cartTouchedAt = new Date().toISOString();
  saveDb();
  writeAudit({
    sessionId,
    type: `cart.${action}`,
    explainable: true,
    bounded: true,
    gated: true,
    reason:
      action === "clear"
        ? "Cart cleared."
        : `${action} ${product?.name ?? sku} ×${qty}.`,
    data: { sku, qty, cart: session.cart.map((l) => ({ ...l })) },
  });
  return session.cart;
}

export function getMandateForSession(sessionId: string) {
  const session = getOrCreateSession(sessionId);
  const mandate = getDb().mandates[session.mandateId];
  if (!mandate) throw new Error("Mandate missing");
  return mandate;
}
