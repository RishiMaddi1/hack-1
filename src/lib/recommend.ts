import { PRODUCTS, getProduct } from "./catalog";
import { getCart, getMandateForSession } from "./cart";
import { priceCart } from "./quote";
import { writeAudit } from "./audit";
import { formatInr } from "./money";
import { shelfPricePaise } from "./price-refs";
import { rememberSuggest } from "./suggest-memory";
import type { ChatProductCard, Product } from "./types";

export function toCard(p: Product): ChatProductCard {
  const shelf = shelfPricePaise(p);
  return {
    sku: p.sku,
    name: p.name,
    short: p.short,
    details: p.details,
    pricePaise: p.pricePaise,
    image: p.image,
    discountedPaise: shelf !== p.pricePaise ? shelf : undefined,
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

export function pickUpgrade(
  matches: Product[],
  remainingPaise: number,
  query = "",
): Product | undefined {
  const cat = matches[0]?.category;
  if (!cat || !matches.length) return undefined;
  const takenSkus = new Set(matches.map((m) => m.sku));
  // Compare shelf prices so campaign SKUs rank the same way cards do.
  const maxMatch = Math.max(...matches.map((m) => shelfPricePaise(m)));
  const wantsLight = /light|weight|ultralight/.test(query.toLowerCase());

  // Same-category step-up: costlier than matches, within mandate remaining.
  // Search budget ("under 3k") only filters MATCHES — upgrades may be above that budget.
  const sameCat = PRODUCTS.filter((p) => {
    if (p.category !== cat || takenSkus.has(p.sku)) return false;
    const shelf = shelfPricePaise(p);
    if (shelf <= maxMatch) return false;
    if (shelf > remainingPaise) return false;
    return true;
  }).map((p) => {
    const hay = `${p.name} ${p.short} ${p.tags.join(" ")}`.toLowerCase();
    const shelf = shelfPricePaise(p);
    let score = 0;
    if (wantsLight && /ultralight|48g|49g|55g|lightweight/.test(hay)) score += 5;
    score -= Math.floor((shelf - maxMatch) / 10000);
    return { p, score, shelf };
  });
  // Prefer nearest step up above the priciest match.
  sameCat.sort((a, b) => a.shelf - b.shelf || b.score - a.score);
  if (sameCat[0]) return sameCat[0].p;

  // Truly no costlier SKU in this lane under the mandate → other category only if
  // matches already include the costliest same-category SKU that fits remaining.
  const costliestInMandate = PRODUCTS.filter(
    (p) => p.category === cat && shelfPricePaise(p) <= remainingPaise,
  ).sort((a, b) => shelfPricePaise(b) - shelfPricePaise(a))[0];
  if (!costliestInMandate) return undefined;
  const topShelf = shelfPricePaise(costliestInMandate);
  const atTop = matches.some(
    (m) => m.sku === costliestInMandate.sku || shelfPricePaise(m) >= topShelf,
  );
  if (!atTop) return undefined;

  return pickCrossCategoryAddon(cat, takenSkus, remainingPaise);
}

/**
 * Companions declared in catalog data: targets of upsellSku from products in `fromCat`
 * (cross-category only). Frequency-ranked — no lane name tables.
 */
function companionsFromCatalogLinks(fromCat: Product["category"]): Product[] {
  const counts = new Map<string, number>();
  for (const p of PRODUCTS) {
    if (p.category !== fromCat || !p.upsellSku) continue;
    const t = getProduct(p.upsellSku);
    if (!t || t.category === fromCat) continue;
    counts.set(t.sku, (counts.get(t.sku) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([sku]) => getProduct(sku)!)
    .filter(Boolean);
}

/**
 * Different-category companion from catalog links only (upsellSku graph).
 * Never falls back to “cheapest random SKU” (that surfaced junk keychains).
 */
function otherCategoryUnderBudget(
  fromCat: Product["category"],
  takenSkus: Set<string>,
  remainingPaise: number,
  preferSku?: string,
): Product | undefined {
  const fits = (p?: Product) =>
    Boolean(
      p &&
        p.category !== fromCat &&
        !takenSkus.has(p.sku) &&
        shelfPricePaise(p) <= remainingPaise,
    );

  if (preferSku) {
    const linked = getProduct(preferSku);
    if (fits(linked)) return linked;
  }

  for (const p of companionsFromCatalogLinks(fromCat)) {
    if (fits(p)) return p;
  }

  // Chain: follow upsellSku of something already chosen (seed / first pair)
  for (const sku of takenSkus) {
    const cur = getProduct(sku);
    if (!cur?.upsellSku) continue;
    const next = getProduct(cur.upsellSku);
    if (fits(next)) return next;
  }

  return undefined;
}

/** Different-category add-on used only when same-lane step-up is exhausted. */
function pickCrossCategoryAddon(
  cat: Product["category"],
  takenSkus: Set<string>,
  remainingPaise: number,
): Product | undefined {
  return otherCategoryUnderBudget(cat, takenSkus, remainingPaise);
}

export function pickPairs(matches: Product[], remainingPaise: number, cartSkus: Set<string>): Product[] {
  const pairs: Product[] = [];
  const taken = new Set([...cartSkus, ...matches.map((m) => m.sku)]);
  const add = (p?: Product) => {
    if (!p || taken.has(p.sku) || shelfPricePaise(p) > remainingPaise) return;
    if (pairs.some((x) => x.sku === p.sku)) return;
    pairs.push(p);
    taken.add(p.sku);
  };
  const seed = matches[0];
  if (!seed) return pairs;
  // 1) Seed's declared companion
  add(otherCategoryUnderBudget(seed.category, taken, remainingPaise, seed.upsellSku));
  // 2) Next link in catalog graph (e.g. mouse → pad), or another popular companion for the lane
  if (pairs[0]?.upsellSku) {
    add(otherCategoryUnderBudget(seed.category, taken, remainingPaise, pairs[0].upsellSku));
  }
  add(otherCategoryUnderBudget(seed.category, taken, remainingPaise));
  return pairs.slice(0, 2);
}

export function pickCartUpsell(sessionId: string): ChatProductCard | undefined {
  const cart = getCart(sessionId);
  if (!cart.length) return undefined;
  const remaining = remainingFor(sessionId);
  const products = cart.map((l) => getProduct(l.sku)).filter(Boolean) as Product[];
  // Prefer stepping up the last-added line's category.
  const focus = [...products].reverse();
  const upgrade = pickUpgrade(focus.slice(0, 1), remaining);
  if (upgrade) {
    if (cart.some((l) => l.sku === upgrade.sku)) return undefined;
    writeAudit({
      sessionId,
      type: "upsell.proposed",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Proposed ${upgrade.name} (${formatInr(upgrade.pricePaise)}) within remaining ${formatInr(remaining)}.`,
      data: { sku: upgrade.sku, remaining },
    });
    return toCard(upgrade);
  }
  return undefined;
}

export function enrichFromSearch(sessionId: string, hits: Product[], query = "", budgetPaise?: number) {
  const remaining = remainingFor(sessionId);
  const cartSkus = new Set(getCart(sessionId).map((l) => l.sku));
  const cat = hits[0]?.category;
  const inLane = cat ? hits.filter((p) => p.category === cat) : hits;

  // Budget uses shelf price (what cards show), not raw list — so ₹3,149 list / ₹2,834 sale still counts as under 3k.
  const inBudget = budgetPaise
    ? inLane.filter((p) => shelfPricePaise(p) <= budgetPaise)
    : inLane;
  inBudget.sort((a, b) => shelfPricePaise(a) - shelfPricePaise(b));

  // Up to 3 distinct models in budget for MATCHES.
  const matches = uniqueModels(inBudget, 3);
  const seed = matches.length ? matches : uniqueModels(inLane, 3);

  // Step-up: costlier than every match, same lane, within mandate (may be over the search budget).
  const upgrade = pickUpgrade(seed, remaining, query);
  const pairs = pickPairs(seed, remaining, cartSkus).filter((p) => p.sku !== upgrade?.sku);
  if (upgrade) {
    writeAudit({
      sessionId,
      type: "upsell.proposed",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Step-up ${upgrade.name} (${formatInr(shelfPricePaise(upgrade))}) within remaining ${formatInr(remaining)}.`,
      data: { sku: upgrade.sku, remaining, sameCategory: upgrade.category === seed[0]?.category },
    });
  }
  for (const p of pairs) {
    writeAudit({
      sessionId,
      type: "crosssell.proposed",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Pair ${p.name} (${formatInr(shelfPricePaise(p))}) with the search results.`,
      data: { sku: p.sku, remaining },
    });
  }
  const out = {
    products: seed.map(toCard),
    upsell: upgrade ? toCard(upgrade) : undefined,
    crossSell: pairs.map(toCard),
  };
  rememberSuggest(sessionId, out);
  return out;
}

export function stripClerkMarkdown(text: string) {
  return text
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[-*]\s+\*?\*?[A-Za-z]+:\*?\*?\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
