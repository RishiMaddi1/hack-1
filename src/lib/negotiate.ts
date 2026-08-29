import { PRODUCTS, getProduct } from "./catalog";
import { formatInr } from "./money";
import type { Mandate, NegotiateSuggestion, CheckoutRecord } from "./types";

/**
 * Same buyer agent can apply these — counters when mandate blocks Order create.
 */
export function buildNegotiate(
  mandate: Mandate,
  lines: CheckoutRecord["lines"],
  payablePaise: number,
): NegotiateSuggestion[] {
  const remaining = mandate.remainingPaise;
  const out: NegotiateSuggestion[] = [];

  const sorted = [...lines].sort((a, b) => b.linePaise - a.linePaise);
  for (const line of sorted) {
    const after = payablePaise - line.linePaise;
    if (after <= remaining && after >= 0) {
      out.push({
        action: "remove_sku",
        sku: line.sku,
        name: line.name,
        pricePaise: line.linePaise,
        note: `Remove ${line.name} (−${formatInr(line.linePaise)}) to fit ${formatInr(remaining)} left.`,
      });
      break;
    }
  }

  const expensive = sorted[0];
  if (expensive) {
    const substitutes = PRODUCTS.filter(
      (p) =>
        p.sku !== expensive.sku &&
        p.category === (getProduct(expensive.sku)?.category || p.category) &&
        p.pricePaise <= remaining &&
        p.pricePaise < expensive.unitPaise,
    )
      .sort((a, b) => b.pricePaise - a.pricePaise)
      .slice(0, 2);

    for (const sub of substitutes) {
      out.push({
        action: "swap_to",
        sku: sub.sku,
        name: sub.name,
        pricePaise: sub.pricePaise,
        replaceSku: expensive.sku,
        note: `Swap ${expensive.name} for ${sub.name} at ${formatInr(sub.pricePaise)} (fits ${formatInr(remaining)}).`,
      });
    }
  }

  if (!out.length) {
    const cheap = PRODUCTS.filter((p) => p.pricePaise <= remaining)
      .sort((a, b) => a.pricePaise - b.pricePaise)
      .slice(0, 2);
    for (const p of cheap) {
      out.push({
        action: "swap_to",
        sku: p.sku,
        name: p.name,
        pricePaise: p.pricePaise,
        note: `Clear the bag and add ${p.name} at ${formatInr(p.pricePaise)} within ${formatInr(remaining)}.`,
      });
    }
  }

  return out.slice(0, 3);
}
