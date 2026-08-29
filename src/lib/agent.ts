import { writeAudit } from "./audit";
import { getProduct, searchCatalog, PRODUCTS } from "./catalog";
import { getCart, getMandateForSession, mutateCart } from "./cart";
import { quoteCheckout } from "./checkout";
import { formatInr } from "./money";
import { priceCart } from "./quote";
import { runOpenAIBuyer } from "./openai-agent";
import { enrichFromSearch, pickCartUpsell, pickPairs, toCard } from "./recommend";
import type { ChatMessage } from "./types";

function extractBudget(text: string): number | undefined {
  const m = text.match(/₹\s?(\d+)\s*(k)?|under\s+(\d+)\s*(k)?|below\s+(\d+)\s*(k)?/i);
  if (!m) return undefined;
  const n = Number(m[1] || m[3] || m[5]);
  const thousand = Boolean(m[2] || m[4] || m[6]);
  if (!Number.isFinite(n)) return undefined;
  return (thousand ? n * 1000 : n) * 100;
}

function findSkuInText(text: string): string | undefined {
  const lower = text.toLowerCase();
  const exact = PRODUCTS.find((p) => lower.includes(p.sku));
  if (exact) return exact.sku;
  const hits = searchCatalog(text);
  if (hits.length === 1) return hits[0].sku;
  const named = hits.find((p) => lower.includes(p.name.toLowerCase().slice(0, 20).toLowerCase()));
  if (named) return named.sku;
  if (/swarm\s*65/.test(lower)) return "swarm65-black-purple-wireless-mechanical-gaming-keyboard";
  if (/hive\s*75\s*he|hive75 he/.test(lower)) return "hive75-he-wired-magnetic-hall-effect-gaming-keyboard";
  if (/harpy/.test(lower)) return "harpy-black-light-weight-rgb-gaming-mouse";
  if (/surge pro/.test(lower)) return "surge-pro-wireless-gaming-controller-with-tmr-joysticks";
  if (/beluga/.test(lower)) return "beluga-gaming-headphone";
  if (/obsidian/.test(lower) && /200/.test(lower)) return "obsidian-27-inch-gaming-monitor";
  if (/obsidian/.test(lower)) return "obsidian-27-inch-100hz-2k-1440p-qhd-ips-monitor";
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

  const fromOpenAI = await runOpenAIBuyer(sessionId, raw);
  if (fromOpenAI) return fromOpenAI;

  if (/^pay$|checkout|place order|buy now|complete payment/.test(lower)) {
    const result = await quoteCheckout(sessionId);
    if (result.status === 400) {
      return { id: crypto.randomUUID(), role: "assistant", text: result.body.error };
    }
    if (result.status === 403) {
      const tips = result.body.negotiate?.map((n) => n.note).slice(0, 2).join(" ") || "";
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        text: `Stopped before Razorpay. ${result.body.breakdown.explanation}${tips ? ` Next: ${tips}` : ""}`,
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
      const rec = enrichFromSearch(sessionId, searchCatalog(raw), raw);
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Which one? Use a card, or name it.",
        products: rec.products,
        upsell: rec.upsell,
        crossSell: rec.crossSell,
      };
    }
    mutateCart(sessionId, "add", sku, 1);
    const product = getProduct(sku)!;
    const upsell = pickCartUpsell(sessionId);
    const priced = priceCart(getCart(sessionId));
    const remaining = getMandateForSession(sessionId).remainingPaise - priced.payablePaise;
    const pairs = pickPairs([product], remaining, new Set(getCart(sessionId).map((l) => l.sku)));
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: `Added ${product.name}. Cart is ${formatInr(priced.payablePaise)}. ${priced.campaignExplain}${
        upsell ? ` Step up: ${upsell.name}.` : ""
      }${pairs[0] ? ` Often bought with ${pairs[0].name}.` : ""}`,
      products: [toCard(product)],
      upsell,
      crossSell: pairs.map(toCard),
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
  const hits = searchCatalog(raw, budget);
  const rec = enrichFromSearch(sessionId, hits, raw, budget);
  writeAudit({
    sessionId,
    type: "catalog.search",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Searched catalog for “${raw}”. Returned ${hits.length} agent-readable SKUs.`,
    data: { query: raw, skus: hits.map((p) => p.sku) },
  });

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text:
      rec.products.length === 0
        ? "Nothing matched. Try Swarm, Harpy, Surge, or Obsidian."
        : `Here is what fits${budget ? ` around ${formatInr(budget)}` : ""}.${
            rec.upsell ? ` A step up still inside your cap: ${rec.upsell.name}.` : ""
          }${rec.crossSell[0] ? ` Often bought with ${rec.crossSell[0].name}.` : ""}`,
    products: rec.products,
    upsell: rec.upsell,
    crossSell: rec.crossSell,
  };
}
