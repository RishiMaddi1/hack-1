import { PRODUCTS, getProduct } from "./catalog";
import { getCart, getMandateForSession } from "./cart";
import { priceCart } from "./quote";
import { applyCampaign } from "./campaigns";
import { writeAudit } from "./audit";
import { formatInr } from "./money";
import type { ChatProductCard, Product } from "./types";

export function toCard(p: Product): ChatProductCard {
  const campaign = applyCampaign([p], p.pricePaise);
  return {
    sku: p.sku,
    name: p.name,
    short: p.short,
    details: p.details,
    pricePaise: p.pricePaise,
    image: p.image,
    discountedPaise: campaign.discountPaise ? p.pricePaise - campaign.discountPaise : undefined,
  };
}

export function modelKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(white|black|purple|grey|gray)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueModels(products: Product[], limit = 3): Product[] {
  const seen = new Set<string>();
  const out: Product[] = [];
  for (const p of products) {
    const k = modelKey(p.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

function remainingFor(sessionId: string) {
  const mandate = getMandateForSession(sessionId);
  const priced = priceCart(getCart(sessionId));
  return mandate.remainingPaise - priced.payablePaise;
}

export function pickUpgrade(matches: Product[], remainingPaise: number, query = ""): Product | undefined {
  const cat = matches[0]?.category;
  if (!cat) return undefined;
  const takenSkus = new Set(matches.map((m) => m.sku));
  const takenModels = new Set(matches.map((m) => modelKey(m.name)));
  const floor = Math.min(...matches.map((m) => m.pricePaise));
  const wantsLight = /light|weight|ultralight/.test(query.toLowerCase());
  const scored = PRODUCTS.filter((p) => {
    if (p.category !== cat || takenSkus.has(p.sku)) return false;
    if (takenModels.has(modelKey(p.name))) return false;
    if (p.pricePaise <= floor) return false;
    if (p.pricePaise > remainingPaise) return false;
    return true;
  }).map((p) => {
    const hay = `${p.name} ${p.short} ${p.tags.join(" ")}`.toLowerCase();
    let score = 0;
    if (wantsLight && /ultralight|48g|49g|55g|lightweight/.test(hay)) score += 5;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score || a.p.pricePaise - b.p.pricePaise);
  return scored[0]?.p;
}

export function pickPairs(matches: Product[], remainingPaise: number, cartSkus: Set<string>): Product[] {
  const pairs: Product[] = [];
  const add = (p?: Product) => {
    if (!p || cartSkus.has(p.sku) || p.pricePaise > remainingPaise) return;
    if (pairs.some((x) => x.sku === p.sku) || matches.some((m) => m.sku === p.sku)) return;
    pairs.push(p);
  };
  for (const m of matches) add(getProduct(m.upsellSku || ""));
  const cat = matches[0]?.category;
  if (cat === "mouse" || cat === "keyboard") {
    add(PRODUCTS.find((p) => /mousepad|deskmat/i.test(p.name) && p.pricePaise <= remainingPaise));
  }
  if (cat === "mouse") add(PRODUCTS.find((p) => p.category === "keyboard" && p.pricePaise <= remainingPaise));
  if (cat === "keyboard") add(PRODUCTS.find((p) => p.category === "mouse" && p.pricePaise <= remainingPaise));
  if (cat === "controller") add(PRODUCTS.find((p) => p.category === "mouse" && p.pricePaise <= remainingPaise));
  if (cat === "audio") add(PRODUCTS.find((p) => /boom arm|shock mount/i.test(p.name) && p.pricePaise <= remainingPaise));
  return pairs.slice(0, 2);
}

export function pickCartUpsell(sessionId: string): ChatProductCard | undefined {
  const cart = getCart(sessionId);
  const remaining = remainingFor(sessionId);
  for (const line of [...cart].reverse()) {
    const product = getProduct(line.sku);
    const sku = product?.upsellSku;
    if (!sku || cart.some((l) => l.sku === sku)) continue;
    const upsell = getProduct(sku);
    if (!upsell) continue;
    if (upsell.pricePaise > remaining) {
      writeAudit({
        sessionId,
        type: "upsell.refused",
        explainable: true,
        bounded: true,
        gated: true,
        reason: `Refused ${upsell.name} at ${formatInr(upsell.pricePaise)} — remaining after cart is ${formatInr(remaining)}.`,
        data: { sku, remaining },
      });
      continue;
    }
    writeAudit({
      sessionId,
      type: "upsell.proposed",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Proposed ${upsell.name} (${formatInr(upsell.pricePaise)}) within remaining ${formatInr(remaining)}.`,
      data: { sku, remaining },
    });
    return toCard(upsell);
  }
  return undefined;
}

export function enrichFromSearch(sessionId: string, hits: Product[], query = "", budgetPaise?: number) {
  const remaining = remainingFor(sessionId);
  const cartSkus = new Set(getCart(sessionId).map((l) => l.sku));
  const unique = uniqueModels(hits, 8);
  const cat = unique[0]?.category;
  const inLane = cat ? unique.filter((p) => p.category === cat) : unique;
  const matches = (budgetPaise ? inLane.filter((p) => p.pricePaise <= budgetPaise) : inLane).slice(0, 3);
  const seed = matches.length ? matches : inLane.slice(0, 3);
  const upgrade = pickUpgrade(seed, remaining, query);
  const pairs = pickPairs(seed, remaining, cartSkus).filter((p) => p.sku !== upgrade?.sku);
  if (upgrade) {
    writeAudit({
      sessionId,
      type: "upsell.proposed",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Step-up ${upgrade.name} (${formatInr(upgrade.pricePaise)}) within remaining ${formatInr(remaining)}.`,
      data: { sku: upgrade.sku, remaining },
    });
  }
  for (const p of pairs) {
    writeAudit({
      sessionId,
      type: "crosssell.proposed",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Pair ${p.name} (${formatInr(p.pricePaise)}) with the search results.`,
      data: { sku: p.sku, remaining },
    });
  }
  return {
    products: (matches.length ? matches : seed).map(toCard),
    upsell: upgrade ? toCard(upgrade) : undefined,
    crossSell: pairs.map(toCard),
  };
}

export function stripClerkMarkdown(text: string) {
  return text
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[-*]\s+\*?\*?[A-Za-z]+:\*?\*?\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
