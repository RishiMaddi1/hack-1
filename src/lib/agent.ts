import { writeAudit } from "./audit";
import { applyCampaign } from "./campaigns";
import { getProduct, searchCatalog } from "./catalog";
import { getCart, getMandateForSession, mutateCart } from "./cart";
import { quoteCheckout } from "./checkout";
import { formatInr } from "./money";
import { priceCart } from "./quote";
import type { ChatMessage, ChatProductCard, Product } from "./types";

function toCard(p: Product): ChatProductCard {
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

function pickUpsell(sessionId: string): ChatProductCard | undefined {
  const cart = getCart(sessionId);
  const mandate = getMandateForSession(sessionId);
  const priced = priceCart(cart);
  const remaining = mandate.remainingPaise - priced.payablePaise;
  for (const line of [...cart].reverse()) {
    const product = getProduct(line.sku);
    const sku = product?.upsellSku;
    if (!sku) continue;
    if (cart.some((l) => l.sku === sku)) continue;
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

function extractBudget(text: string): number | undefined {
  const m = text.match(/₹\s?(\d+)|under\s+(\d+)|below\s+(\d+)/i);
  if (!m) return undefined;
  const n = Number(m[1] || m[2] || m[3]);
  return Number.isFinite(n) ? n * 100 : undefined;
}

function findSkuInText(text: string): string | undefined {
  const lower = text.toLowerCase();
  const bySku = lower.match(/cof-[\w-]+|tea-[\w-]+|jag-[\w-]+|bis-[\w-]+|mil-[\w-]+|sug-[\w-]+|fil-[\w-]+|mug-[\w-]+|hon-[\w-]+|nut-[\w-]+|cho-[\w-]+|spi-[\w-]+|water-[\w-]+|kit-[\w-]+|blend-[\w-]+/);
  if (bySku) return bySku[0];
  const hits = searchCatalog(text);
  if (hits.length === 1) return hits[0].sku;
  const named = hits.find((p) => lower.includes(p.name.toLowerCase().split(",")[0].toLowerCase()));
  if (named) return named.sku;
  if (/jaggery/.test(lower)) return "jag-organic";
  if (/blender|mixie/.test(lower)) return "blend-pro";
  if (/hamper|gift/.test(lower)) return "kit-gift";
  if (/250g|250 g/.test(lower) && /coffee|filter/.test(lower)) return "cof-filter-250";
  if (/500g|500 g/.test(lower) && /coffee|filter/.test(lower)) return "cof-filter-500";
  return undefined;
}

export async function runBuyerAgent(sessionId: string, text: string): Promise<ChatMessage> {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  writeAudit({
    sessionId,
    type: "agent.turn",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Buyer said: ${raw.slice(0, 180)}`,
    data: { text: raw },
  });

  if (/^pay$|checkout|place order|buy now|complete payment/.test(lower)) {
    const result = await quoteCheckout(sessionId);
    if (result.status === 400) {
      return { id: crypto.randomUUID(), role: "assistant", text: result.body.error };
    }
    if (result.status === 403) {
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        text: `Stopped before Razorpay. ${result.body.breakdown.explanation}`,
        quote: result.body,
      };
    }
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: `Checkout is gated and quoted. Pay ${formatInr(result.body.breakdown.payablePaise)} on Razorpay test mode. ${result.body.breakdown.explanation}`,
      quote: result.body,
    };
  }

  if (/add |put |cart |i'll take|ill take|take the/.test(lower) || /add to cart/.test(lower)) {
    const sku = findSkuInText(raw);
    if (!sku) {
      const products = searchCatalog(raw).map(toCard);
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Which one? Click Add to cart on a card, or name it.",
        products,
      };
    }
    mutateCart(sessionId, "add", sku, 1);
    const product = getProduct(sku)!;
    const upsell = pickUpsell(sessionId);
    const priced = priceCart(getCart(sessionId));
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: `Added ${product.name}. Cart is ${formatInr(priced.payablePaise)}. ${priced.campaignExplain}${
        upsell ? ` Pair it with ${upsell.name}? Still inside the mandate.` : ""
      }`,
      products: [toCard(product)],
      upsell,
    };
  }

  if (/remove |drop |delete /.test(lower)) {
    const sku = findSkuInText(raw);
    if (sku) mutateCart(sessionId, "remove", sku);
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: sku ? `Removed ${getProduct(sku)?.name}.` : "Tell me which SKU to remove.",
    };
  }

  const budget = extractBudget(raw);
  const products = searchCatalog(raw, budget).map(toCard);
  writeAudit({
    sessionId,
    type: "catalog.search",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Searched catalog for “${raw}”. Returned ${products.length} agent-readable SKUs.`,
    data: { query: raw, skus: products.map((p) => p.sku) },
  });

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text:
      products.length === 0
        ? "Nothing matched. Try coffee, chai, jaggery, or blender."
        : `Found ${products.length} from the agent-readable catalog${
            budget ? ` under ${formatInr(budget)}` : ""
          }. Add from a card or tell me which one.`,
    products,
  };
}
