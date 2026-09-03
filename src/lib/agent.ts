import { writeAudit } from "./audit";
import { getProduct, searchCatalog } from "./catalog";
import { getCart, getMandateForSession, mutateCart } from "./cart";
import { quoteCheckout } from "./checkout";
import { listCampaigns } from "./campaigns";
import { formatInr } from "./money";
import { priceCart } from "./quote";
import { runOpenAIBuyer } from "./openai-agent";
import { enrichFromSearch, pickCartUpsell, pickPairs, toCard } from "./recommend";
import { getLastSuggest, rememberSuggest } from "./suggest-memory";
import type { ChatMessage } from "./types";

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  /** SKUs shown on cards that turn — so “2nd keyboard” resolves across turns. */
  skus?: string[];
  upsellSku?: string;
  pairSkus?: string[];
};

type NamedSku = { sku: string; name: string };

const STOP = new Set([
  "add", "put", "take", "cart", "bag", "art", "my", "the", "that", "this", "also", "too",
  "you", "suggested", "suggest", "sggest", "suger", "sugget", "and", "to", "please", "a",
  "an", "of", "for", "with", "me", "into", "in", "your", "show", "get", "want", "wanna",
  "like", "just", "both", "as", "well", "can", "could", "would", "buy", "order",
]);

function extractBudget(text: string): number | undefined {
  const m = text.match(/₹\s?(\d+)\s*(k)?|under\s+(\d+)\s*(k)?|below\s+(\d+)\s*(k)?/i);
  if (!m) return undefined;
  const n = Number(m[1] || m[3] || m[5]);
  const thousand = Boolean(m[2] || m[4] || m[6]);
  if (!Number.isFinite(n)) return undefined;
  return (thousand ? n * 1000 : n) * 100;
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function queryTokens(text: string) {
  return norm(text)
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

/** Every product the agent already showed (session suggest + chat card history). */
function shownFromContext(sessionId: string, history: ChatTurn[]): NamedSku[] {
  const seen = new Set<string>();
  const out: NamedSku[] = [];
  const push = (sku?: string, name?: string) => {
    if (!sku || seen.has(sku)) return;
    const p = getProduct(sku);
    if (!p) return;
    seen.add(sku);
    out.push({ sku: p.sku, name: name || p.name });
  };

  const s = getLastSuggest(sessionId);
  if (s) {
    for (const p of s.products) push(p.sku, p.name);
    if (s.upsell) push(s.upsell.sku, s.upsell.name);
    for (const p of s.crossSell) push(p.sku, p.name);
  }
  for (const turn of [...history].reverse()) {
    for (const sku of turn.skus || []) push(sku);
    push(turn.upsellSku);
    for (const sku of turn.pairSkus || []) push(sku);
  }
  return out;
}

function productCategory(sku: string) {
  return getProduct(sku)?.category;
}

function isPad(p: NamedSku) {
  const prod = getProduct(p.sku);
  if (prod?.category !== "accessory") return false;
  return /mouse\s*pad|deskmat|pad/i.test(`${p.name} ${p.sku}`);
}

function isMouse(p: NamedSku) {
  return productCategory(p.sku) === "mouse";
}

function isKeyboard(p: NamedSku) {
  return productCategory(p.sku) === "keyboard";
}

function isController(p: NamedSku) {
  return productCategory(p.sku) === "controller";
}

function cartAsNamed(sessionId: string): NamedSku[] {
  return getCart(sessionId)
    .map((l) => {
      const p = getProduct(l.sku);
      return p ? { sku: p.sku, name: p.name } : null;
    })
    .filter((x): x is NamedSku => Boolean(x));
}

function isRemoveIntent(text: string) {
  return /\b(remove|drop|delete|take\s+out|get\s+rid|clear\s+(the\s+)?(item|line)|without)\b/i.test(
    text,
  );
}

/** Remove from the live cart — prefer cart lines over suggestion cards. */
function resolveRemoveSku(sessionId: string, text: string, history: ChatTurn[]): string | undefined {
  const cart = cartAsNamed(sessionId);
  const lower = text.toLowerCase();
  const anyOne = /\b(any|one|a|an)\b/i.test(lower);

  if (/\bcontrollers?\b/i.test(lower) || /\bgamepad\b/i.test(lower)) {
    const hit = cart.find(isController);
    if (hit) return hit.sku;
  }
  if (/\bkeyboa|kayboa|keyboard|\bkb\b/i.test(lower)) {
    const hit = cart.find(isKeyboard);
    if (hit) return hit.sku;
  }
  if (/\bmouse\b|\bmice\b/i.test(lower) && !/pad|deskmat/i.test(lower)) {
    const hit = cart.find(isMouse);
    if (hit) return hit.sku;
  }
  if (/\b(mouse\s*pads?|deskmat)\b/i.test(lower)) {
    const hit = cart.find(isPad);
    if (hit) return hit.sku;
  }

  const fromCart = bestInPool(cart, text);
  if (fromCart) return fromCart;

  // “remove any one” / vague — drop the most expensive cart line
  if (anyOne && cart.length) {
    const priced = [...cart].sort(
      (a, b) => (getProduct(b.sku)?.pricePaise || 0) - (getProduct(a.sku)?.pricePaise || 0),
    );
    return priced[0]?.sku;
  }

  return findSkuInText(text, [...cart, ...shownFromContext(sessionId, history)]);
}

/** Score how well buyer text points at a known product name/sku (no hardcoded SKUs). */
function nameMatchScore(item: NamedSku, text: string): number {
  const hay = norm(`${item.name} ${item.sku}`);
  const hayCompact = hay.replace(/\s/g, "");
  const utter = norm(text);
  const utterCompact = utter.replace(/\s/g, "");
  let score = 0;

  const nameBits = norm(item.name).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  for (const bit of nameBits) {
    if (utter.includes(bit) || utterCompact.includes(bit.replace(/\s/g, ""))) score += bit.length >= 5 ? 4 : 2;
  }
  // sku segments like hive98 / harpy / swarm65
  for (const seg of item.sku.split("-")) {
    if (seg.length < 3) continue;
    if (utterCompact.includes(seg) || utter.includes(seg)) score += 5;
    // “hive 98” ↔ hive98
    const splitNum = seg.match(/^([a-z]+)(\d+[a-z]*)$/i);
    if (splitNum) {
      const [, letters, digits] = splitNum;
      if (utter.includes(letters) && utter.includes(digits)) score += 8;
    }
  }
  for (const t of queryTokens(text)) {
    if (hay.includes(t) || hayCompact.includes(t)) score += t.length >= 4 ? 2 : 1;
  }
  // “mouse” must not win on “Mousepad”
  if (/\bmouse\b/.test(utter) && isPad(item) && !/pad|deskmat/.test(utter)) score -= 20;
  return score;
}

function bestInPool(pool: NamedSku[], text: string, pred?: (p: NamedSku) => boolean): string | undefined {
  const candidates = pred ? pool.filter(pred) : pool;
  let best: NamedSku | undefined;
  let bestScore = 0;
  for (const p of candidates) {
    const s = nameMatchScore(p, text);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  // Prefer a real name hit over noise
  if (!best || bestScore < 4) return undefined;
  return best.sku;
}

function searchQueryFromAdd(text: string) {
  return queryTokens(text).join(" ");
}

/** Catalog resolve — match shown cards first, then search — never a hardcoded SKU table. */
function findSkuInText(text: string, prefer?: NamedSku[]): string | undefined {
  const lower = text.toLowerCase();
  if (prefer?.length) {
    const fromShown = bestInPool(prefer, text);
    if (fromShown) return fromShown;
  }
  // Exact sku pasted into chat
  for (const hit of searchCatalog(searchQueryFromAdd(text) || text)) {
    if (lower.includes(hit.sku)) return hit.sku;
  }
  const catalogHits = searchCatalog(searchQueryFromAdd(text) || text);
  const asNamed = catalogHits.map((p) => ({ sku: p.sku, name: p.name }));
  const scored = bestInPool(asNamed, text);
  if (scored) return scored;
  if (catalogHits.length === 1) return catalogHits[0].sku;
  if (catalogHits[0] && queryTokens(text).length >= 1) {
    const top = catalogHits[0];
    if (nameMatchScore({ sku: top.sku, name: top.name }, text) >= 6) return top.sku;
  }
  return undefined;
}

function ordinalIndex(text: string): number | null {
  if (/\b(1st|first|one)\b/i.test(text)) return 0;
  if (/\b(2nd|second|two)\b/i.test(text)) return 1;
  if (/\b(3rd|third|three)\b/i.test(text)) return 2;
  return null;
}

/**
 * Resolve add intents from what we already showed + catalog search.
 * History card SKUs / lastSuggest are the source of truth — not alias tables.
 */
function skusFromSuggestionSpeech(
  sessionId: string,
  text: string,
  history: ChatTurn[],
): string[] {
  const lower = text.toLowerCase();
  // Never treat remove / drop speech as an add — “from my bag” used to match wantsAdd via “bag”.
  if (isRemoveIntent(lower)) return [];
  const wantsAdd =
    /\b(add|put)\b/i.test(lower) ||
    /\b(add|put|take)\b.*\b(cart|bag)\b/i.test(lower) ||
    /\b(cart|bag)\b.*\b(add|put)\b/i.test(lower);
  if (!wantsAdd) return [];

  const pool = shownFromContext(sessionId, history);
  const last = getLastSuggest(sessionId);
  const skus: string[] = [];
  const push = (sku?: string) => {
    if (sku && !skus.includes(sku)) skus.push(sku);
  };

  const ord = ordinalIndex(lower);
  const wantsKeyboard = /keyboa|kayboa|keyboard|\bkb\b/i.test(lower);
  const wantsMouse = /\bmouse\b|\bmice\b/i.test(lower);
  const wantsPad = /\b(mouse\s*pads?|deskmat)\b/i.test(lower);
  const wantsUpgrade = /upgrade|step\s*up|costlier/i.test(lower);

  if (ord != null && last) {
    const lane = wantsKeyboard ? last.products.filter(isKeyboard) : last.products;
    push((lane[ord] || last.products[ord])?.sku);
  }

  if (wantsUpgrade && last?.upsell) push(last.upsell.sku);

  // Named / fuzzy against cards we already showed (full product names live here)
  const namedFromShown = bestInPool(pool, text);
  if (namedFromShown) push(namedFromShown);

  // Lane intents (“the keyboard / mouse / pad you suggested”)
  if (wantsKeyboard && !skus.some((s) => productCategory(s) === "keyboard")) {
    push(
      bestInPool(pool, text, isKeyboard) ||
        (last?.upsell && isKeyboard(last.upsell) ? last.upsell.sku : undefined),
    );
  }
  if (wantsMouse && !skus.some((s) => productCategory(s) === "mouse")) {
    push(bestInPool(pool, text, isMouse) || pool.find(isMouse)?.sku);
  }
  if (wantsPad && !skus.some((s) => isPad({ sku: s, name: getProduct(s)?.name || "" }))) {
    push(bestInPool(pool, text, isPad) || pool.find(isPad)?.sku);
  }

  // Still missing → catalog search on leftover tokens (still no SKU hardcoding)
  const needKeyboard = wantsKeyboard && !skus.some((s) => productCategory(s) === "keyboard");
  const needMouse = wantsMouse && !skus.some((s) => productCategory(s) === "mouse");
  const needPad =
    wantsPad && !skus.some((s) => isPad({ sku: s, name: getProduct(s)?.name || "" }));
  if (!skus.length || needKeyboard || needMouse || needPad) {
    const q = searchQueryFromAdd(text);
    if (q) {
      const hits = searchCatalog(q).map((p) => ({ sku: p.sku, name: p.name }));
      if (needKeyboard) push(bestInPool(hits, text, isKeyboard) || hits.find(isKeyboard)?.sku);
      if (needMouse) push(bestInPool(hits, text, isMouse) || hits.find(isMouse)?.sku);
      if (needPad) push(bestInPool(hits, text, isPad) || hits.find(isPad)?.sku);
      if (!skus.length) push(bestInPool(hits, text) || hits[0]?.sku);
    }
  }

  return skus;
}

export async function runBuyerAgent(
  sessionId: string,
  text: string,
  history: ChatTurn[] = [],
): Promise<ChatMessage> {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  writeAudit({
    sessionId,
    type: "agent.turn",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Buyer said: ${raw.slice(0, 180)}`,
    data: { text: raw, historyTurns: history.length },
  });

  // Removals first — must beat suggestion-add heuristics and OpenAI.
  if (isRemoveIntent(raw)) {
    const sku = resolveRemoveSku(sessionId, raw, history);
    if (sku) {
      mutateCart(sessionId, "remove", sku);
      const priced = priceCart(getCart(sessionId));
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        text: `Removed ${getProduct(sku)?.name}. Bag is ${formatInr(priced.payablePaise)}.`,
        showCart: true,
        products: priced.lines
          .map((l) => getProduct(l.sku))
          .filter(Boolean)
          .map((p) => toCard(p!)),
      };
    }
    const cart = getCart(sessionId);
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: cart.length
        ? `Which line? In bag: ${cart.map((l) => getProduct(l.sku)?.name || l.sku).join(", ")}.`
        : "Bag is empty — nothing to remove.",
      showCart: true,
    };
  }

  // Deterministic: “add 2nd suggested keyboard + mouse then show cart”
  const fromSuggest = skusFromSuggestionSpeech(sessionId, raw, history);
  if (fromSuggest.length) {
    for (const sku of fromSuggest) mutateCart(sessionId, "add", sku, 1);
    const priced = priceCart(getCart(sessionId));
    const cards = priced.lines
      .map((l) => getProduct(l.sku))
      .filter(Boolean)
      .map((p) => toCard(p!));
    const upsell = pickCartUpsell(sessionId);
    const remaining = getMandateForSession(sessionId).remainingPaise - priced.payablePaise;
    const seed = priced.lines.map((l) => getProduct(l.sku)!).filter(Boolean);
    const pairs = pickPairs(seed, remaining, new Set(priced.lines.map((l) => l.sku)));
    const names = fromSuggest.map((sku) => getProduct(sku)?.name || sku).join(" + ");
    const reply: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: `Added ${names}. Bag is ${formatInr(priced.payablePaise)}.`,
      products: cards,
      showCart: true,
      upsell,
      crossSell: pairs.map(toCard),
    };
    rememberSuggest(sessionId, { products: cards, upsell, crossSell: pairs.map(toCard) });
    return reply;
  }

  const fromOpenAI = await runOpenAIBuyer(sessionId, raw, history);
  if (fromOpenAI) return fromOpenAI;

  if (/what('?s| is)? in (my )?(cart|bag|basket)|show (my )?cart|my cart|cart status/.test(lower)) {
    const cart = getCart(sessionId);
    const priced = priceCart(cart);
    const cards = priced.lines
      .map((l) => getProduct(l.sku))
      .filter(Boolean)
      .map((p) => toCard(p!));
    const upsell = pickCartUpsell(sessionId);
    const remaining = getMandateForSession(sessionId).remainingPaise - priced.payablePaise;
    const seed = cart.map((l) => getProduct(l.sku)!).filter(Boolean);
    const pairs = pickPairs(seed, remaining, new Set(cart.map((l) => l.sku)));
    if (!cards.length) {
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Bag is empty. Name a mouse, keyboard, or pad and I’ll add it.",
      };
    }
    const hasDeal = priced.discountPaise > 0;
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: `In your bag: ${priced.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}. Total ${formatInr(priced.payablePaise)}.${
        hasDeal ? ` ${priced.campaignExplain}` : ""
      }`,
      products: cards,
      showCart: true,
      upsell,
      crossSell: pairs.map(toCard),
      ...(hasDeal ? { offerNote: priced.campaignExplain } : {}),
    };
  }

  if (/offer|deal|discount|sale|campaign|promo/.test(lower)) {
    const now = Date.now();
    const live = listCampaigns().filter(
      (c) =>
        c.active &&
        new Date(c.startsAt).getTime() <= now &&
        new Date(c.endsAt).getTime() >= now &&
        c.spentPaise < c.budgetPaise,
    );
    const note =
      live.length === 0
        ? "No live percent-off campaigns right now — catalog prices apply."
        : live.map((c) => `${c.name}: ${c.percentOff}% off`).join(" · ");
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: note,
      offerNote: note,
    };
  }

  if (/^pay$|checkout|place order|buy now|complete payment/.test(lower)) {
    const result = await quoteCheckout(sessionId);
    if (result.status === 400) {
      return { id: crypto.randomUUID(), role: "assistant", text: result.body.error };
    }
    if (!("u402Version" in result.body)) {
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        text: result.body.message || result.body.error,
      };
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
    const sku = findSkuInText(raw, shownFromContext(sessionId, history));
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
      text: `Added ${product.name}. Bag is ${formatInr(priced.payablePaise)}.${
        priced.discountPaise > 0 ? ` ${priced.campaignExplain}` : ""
      }${upsell ? ` Step up: ${upsell.name}.` : ""}${
        pairs[0] ? ` Often bought with ${pairs[0].name}.` : ""
      }`,
      products: [toCard(product)],
      showCart: true,
      upsell,
      crossSell: pairs.map(toCard),
      ...(priced.discountPaise > 0 ? { offerNote: priced.campaignExplain } : {}),
    };
  }

  if (/remove |drop |delete /.test(lower)) {
    const sku = resolveRemoveSku(sessionId, raw, history);
    if (sku) mutateCart(sessionId, "remove", sku);
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: sku ? `Removed ${getProduct(sku)?.name}.` : "Tell me which item in the bag to remove.",
      showCart: true,
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
