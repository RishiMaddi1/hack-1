import { getProduct, searchCatalog } from "./catalog";
import { getCart, getMandateForSession, mutateCart } from "./cart";
import { quoteCheckout } from "./checkout";
import { writeAudit } from "./audit";
import { priceCart } from "./quote";
import { listCampaigns } from "./campaigns";
import { enrichFromSearch, pickCartUpsell, pickPairs, stripClerkMarkdown, toCard } from "./recommend";
import {
  PRICE_TOKEN_HELP,
  cartPayableRef,
  finalizeAgentPrices,
  lineRef,
  mandateMaxRef,
  mandateRemainingRef,
  pRef,
  quoteSummaryForLlm,
} from "./price-refs";
import type { ChatMessage, ChatProductCard, U402Quote } from "./types";
import { formatSuggestContext, rememberSuggest } from "./suggest-memory";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Search the merchant's agent-readable catalog. Use before recommending products.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          budgetRupees: { type: "number", description: "Optional max price in rupees (buyer intent only — not Order amount)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description:
        "Add a known SKU to the cart ONLY when buyer intent is clearly to put something in the bag/cart. If they are browsing, comparing, or asking for details/info about a Match / upgrade / product, do NOT call this — answer instead. Price comes from catalog storage — you cannot set it.",
      parameters: {
        type: "object",
        properties: { sku: { type: "string" }, qty: { type: "number" } },
        required: ["sku"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_from_cart",
      description:
        "Remove a line that is already in the bag. Prefer exact sku from get_cart. If the buyer used a vague name or typo, pass query and the server matches against the live bag via catalog search. Never call add_to_cart on a remove request.",
      parameters: {
        type: "object",
        properties: {
          sku: { type: "string", description: "Exact cart SKU when known" },
          query: {
            type: "string",
            description: "Buyer words for the item (typos ok) when sku is unknown",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cart",
      description:
        "Show what is currently in the shopper's bag (lines, qty, payable). Call whenever they ask what's in cart / bag / basket, or before removing a vague item.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_offers",
      description: "List live merchant campaigns / percent-off deals the shopper can use.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "quote_checkout",
      description:
        "Call when the buyer wants to pay, checkout, settle, or buy the cart. Server prices the cart from catalog storage, checks the mandate, and creates a Razorpay test Order (HTTP 402). Takes NO amount arguments — inventing or passing an amount is forbidden.",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;

type ToolAcc = {
  products: ChatProductCard[];
  showCart?: boolean;
  upsell?: ChatProductCard;
  crossSell?: ChatProductCard[];
  quote?: U402Quote;
  hintedSkus: string[];
  offerNote?: string;
  lastTool?: string;
  lastRemovedName?: string;
};

function hintSku(acc: ToolAcc, sku: string) {
  if (sku && !acc.hintedSkus.includes(sku)) acc.hintedSkus.push(sku);
}

async function runTool(sessionId: string, name: string, args: Record<string, unknown>, acc: ToolAcc) {
  if (name === "search_catalog") {
    const query = String(args.query || "");
    const budget = typeof args.budgetRupees === "number" ? args.budgetRupees * 100 : undefined;
    const hits = searchCatalog(query, budget);
    const rec = enrichFromSearch(sessionId, hits, query, budget);
    acc.products = rec.products;
    acc.upsell = rec.upsell;
    acc.crossSell = rec.crossSell;
    for (const p of rec.products) hintSku(acc, p.sku);
    if (rec.upsell) hintSku(acc, rec.upsell.sku);
    for (const p of rec.crossSell) hintSku(acc, p.sku);
    writeAudit({
      sessionId,
      type: "catalog.search",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `OpenAI searched “${query}”. Returned ${hits.length} SKUs.`,
      data: { query, skus: hits.map((p) => p.sku) },
    });
    return {
      matches: rec.products.map((p) => ({
        sku: p.sku,
        name: p.name,
        price: pRef(p.sku),
        short: p.short.slice(0, 80),
      })),
      upgrade: rec.upsell
        ? { sku: rec.upsell.sku, name: rec.upsell.name, price: pRef(rec.upsell.sku) }
        : null,
      pairs: rec.crossSell.map((p) => ({
        sku: p.sku,
        name: p.name,
        price: pRef(p.sku),
      })),
      note: PRICE_TOKEN_HELP,
    };
  }
  if (name === "add_to_cart") {
    const sku = String(args.sku || "");
    const product = getProduct(sku);
    if (!product) return { error: `Unknown SKU ${sku}` };
    if (typeof args.pricePaise === "number" || typeof args.amountPaise === "number" || typeof args.price === "number") {
      writeAudit({
        sessionId,
        type: "agent.price_injection_blocked",
        explainable: true,
        bounded: true,
        gated: true,
        reason: "Agent/tool tried to pass a price on add_to_cart. Catalog price wins.",
        data: { sku, args },
      });
    }
    mutateCart(sessionId, "add", sku, Number(args.qty) || 1);
    hintSku(acc, sku);
    acc.showCart = true;
    acc.products = [toCard(product)];
    acc.upsell = pickCartUpsell(sessionId);
    const priced = priceCart(getCart(sessionId));
    const remaining = getMandateForSession(sessionId).remainingPaise - priced.payablePaise;
    acc.crossSell = pickPairs([product], remaining, new Set(getCart(sessionId).map((l) => l.sku))).map(toCard);
    if (acc.upsell) hintSku(acc, acc.upsell.sku);
    for (const p of acc.crossSell) hintSku(acc, p.sku);
    return {
      ok: true,
      name: product.name,
      price: pRef(product.sku),
      cartPayable: cartPayableRef(),
      upgrade: acc.upsell ? { sku: acc.upsell.sku, name: acc.upsell.name, price: pRef(acc.upsell.sku) } : null,
      pairs: acc.crossSell.map((p) => ({ sku: p.sku, name: p.name, price: pRef(p.sku) })),
      note: PRICE_TOKEN_HELP,
    };
  }
  if (name === "remove_from_cart") {
    const cart = getCart(sessionId);
    let sku = String(args.sku || "");
    const query = String(args.query || "").trim();

    if (!sku || !cart.some((l) => l.sku === sku)) {
      // Resolve against the live bag using catalog search — no word lists
      const needle = query || sku;
      if (needle) {
        const hits = searchCatalog(needle);
        const bySku = hits.find((h) => cart.some((l) => l.sku === h.sku));
        if (bySku) {
          sku = bySku.sku;
        } else {
          const cats = new Set(hits.slice(0, 6).map((h) => h.category));
          const sameCat = cart.filter((l) => {
            const p = getProduct(l.sku);
            return Boolean(p && cats.has(p.category));
          });
          if (sameCat.length === 1) sku = sameCat[0]!.sku;
          else if (sameCat.length > 1) {
            sku = [...sameCat].sort(
              (a, b) => (getProduct(b.sku)?.pricePaise || 0) - (getProduct(a.sku)?.pricePaise || 0),
            )[0]!.sku;
          }
        }
      }
    }

    if (!sku || !cart.some((l) => l.sku === sku)) {
      return {
        error: "Could not match a bag line. Call get_cart and pick an exact sku.",
        bag: cart.map((l) => ({
          sku: l.sku,
          name: getProduct(l.sku)?.name || l.sku,
          qty: l.qty,
        })),
      };
    }

    const removedName = getProduct(sku)?.name || sku;
    mutateCart(sessionId, "remove", sku);
    acc.lastTool = "remove_from_cart";
    acc.lastRemovedName = removedName;
    const priced = priceCart(getCart(sessionId));
    for (const l of priced.lines) hintSku(acc, l.sku);
    acc.products = priced.lines
      .map((l) => getProduct(l.sku))
      .filter(Boolean)
      .map((p) => toCard(p!));
    acc.showCart = true;
    return {
      ok: true,
      removed: { sku, name: removedName },
      cartPayable: cartPayableRef(),
      lines: priced.lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        line: lineRef(l.sku),
      })),
      note: PRICE_TOKEN_HELP,
    };
  }
  if (name === "get_cart") {
    const cart = getCart(sessionId);
    const priced = priceCart(cart);
    for (const l of priced.lines) hintSku(acc, l.sku);
    const cards = priced.lines
      .map((l) => getProduct(l.sku))
      .filter(Boolean)
      .map((p) => toCard(p!));
    acc.products = cards;
    acc.showCart = true;
    acc.upsell = pickCartUpsell(sessionId);
    const remaining = getMandateForSession(sessionId).remainingPaise - priced.payablePaise;
    const seed = cards.length
      ? cart.map((l) => getProduct(l.sku)!).filter(Boolean)
      : [];
    acc.crossSell = pickPairs(seed, remaining, new Set(cart.map((l) => l.sku))).map(toCard);
    if (acc.upsell) hintSku(acc, acc.upsell.sku);
    for (const p of acc.crossSell) hintSku(acc, p.sku);
    return {
      lines: priced.lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        price: lineRef(l.sku),
      })),
      payable: cartPayableRef(),
      remaining: mandateRemainingRef(),
      max: mandateMaxRef(),
      offer: priced.discountPaise > 0 ? priced.campaignExplain : null,
      upgrade: acc.upsell
        ? { sku: acc.upsell.sku, name: acc.upsell.name, price: pRef(acc.upsell.sku) }
        : null,
      pairs: acc.crossSell.map((p) => ({ sku: p.sku, name: p.name, price: pRef(p.sku) })),
      note: PRICE_TOKEN_HELP,
    };
  }
  if (name === "list_offers") {
    const now = Date.now();
    const live = listCampaigns().filter((c) => {
      if (!c.active) return false;
      if (new Date(c.startsAt).getTime() > now) return false;
      if (new Date(c.endsAt).getTime() < now) return false;
      if (c.spentPaise >= c.budgetPaise) return false;
      return true;
    });
    const note =
      live.length === 0
        ? "No live percent-off campaigns right now."
        : live
            .map(
              (c) =>
                `${c.name}: ${c.percentOff}% off (${c.categories.join(", ") || "selected SKUs"})`,
            )
            .join(" · ");
    acc.offerNote = note;
    return {
      offers: live.map((c) => ({
        name: c.name,
        percentOff: c.percentOff,
        categories: c.categories,
        skus: c.skus,
      })),
      summary: note,
    };
  }
  if (name === "quote_checkout") {
    if (
      typeof args.amountPaise === "number" ||
      typeof args.amount === "number" ||
      typeof args.pricePaise === "number" ||
      typeof args.payablePaise === "number"
    ) {
      writeAudit({
        sessionId,
        type: "agent.amount_injection_blocked",
        explainable: true,
        bounded: true,
        gated: true,
        reason: "Agent tried to pass an amount into quote_checkout. Ignored — server prices cart only.",
        data: { args },
      });
    }
    const result = await quoteCheckout(sessionId);
    if (result.status === 400) return result.body;
    if (!("u402Version" in result.body)) return result.body;
    acc.quote = result.body;
    for (const l of result.body.breakdown.lines) hintSku(acc, l.sku);
    return quoteSummaryForLlm(result.status, result.body.error);
  }
  return { error: `Unknown tool ${name}` };
}

type OaiMessage = {
  role: string;
  content?: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

export async function runOpenAIBuyer(
  sessionId: string,
  text: string,
  history: Array<{
    role: "user" | "assistant";
    text: string;
    skus?: string[];
    upsellSku?: string;
    pairSkus?: string[];
  }> = [],
): Promise<ChatMessage | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const wantsPay = /\b(pay|checkout|place order|buy now|settle|complete payment)\b/i.test(text);
  const cartNow = getCart(sessionId);
  const pricedNow = priceCart(cartNow);
  const bagBlock = cartNow.length
    ? `CURRENT BAG (source of truth for remove/add):\n${cartNow
        .map((l) => {
          const p = getProduct(l.sku);
          return `- sku=${l.sku} name=${p?.name || l.sku} qty=${l.qty} category=${p?.category || "?"}`;
        })
        .join("\n")}\nPayable token: ${cartPayableRef()}`
    : "CURRENT BAG: empty.";

  const system = `You are the buyer agent for this merchant storefront (Circuit / u402 demo).
You shop and you settle using tools. Never invent SKUs — only use SKUs from search_catalog, get_cart, or LAST SUGGESTIONS.
PRICE SECURITY: ${PRICE_TOKEN_HELP}
Example: "This item is {{p:some-catalog-sku}}." Never invent ₹ amounts or digits.
Buyer spend is gated by a signed mandate: max {{mandate.max}}, remaining {{mandate.remaining}} (tokens — do not invent numbers).
The UI already renders product cards. Your text is 1–2 short sentences. No markdown, no **stars**, no Price/Short lists.
Always mention a same-category step-up when the tool returns upgrade — use price tokens. Mention one pair-with item when returned.
When they ask what's in the cart / bag / basket, call get_cart.
When they ask to remove / drop / delete / take out an item (typos are fine), call get_cart if needed, then remove_from_cart with sku and/or query. Never call add_to_cart on a remove request. Vague “any one X” = one matching bag line.
When they ask about deals / offers, call list_offers.
Judge intent from the whole message (any wording / typos). If they are browsing, comparing, or asking for details about a shown Match / upgrade / product — search_catalog and/or answer from LAST SUGGESTIONS; show cards; do NOT call add_to_cart.
Call add_to_cart only when intent is clearly to put item(s) in the bag/cart. Then resolve SKUs via Match N / search_catalog, add_to_cart those exact SKUs only (not pair cards), then get_cart. “First/second/… one” names which Match — it is not itself an add unless they also meant to cart it.
When they want to pay / checkout / settle / buy the cart, call quote_checkout with NO arguments. Never pass amount/price fields.
After a 402, say you created the Razorpay Order for {{cart.payable}}.
If quote_checkout returns "Cart is empty.", tell them to add items first (cards are suggestions until added).
After a 403, no Order was created — use negotiate tips if present.
If mandate expired, tell them to re-authorise a spend cap in Cart.`;

  const messages: OaiMessage[] = [{ role: "system", content: system }];

  for (const turn of history.slice(-12)) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text.slice(0, 800) });
      continue;
    }
    const bits = [turn.text.slice(0, 600)];
    if (turn.skus?.length) {
      bits.push(
        `Cards shown (matches): ${turn.skus
          .map((sku, i) => {
            const p = getProduct(sku);
            return `${i + 1}: ${p?.name || sku} [${sku}]`;
          })
          .join("; ")}`,
      );
    }
    if (turn.upsellSku) {
      const u = getProduct(turn.upsellSku);
      bits.push(`Upgrade card: ${u?.name || turn.upsellSku} [${turn.upsellSku}]`);
    }
    if (turn.pairSkus?.length) {
      bits.push(
        `Pair cards: ${turn.pairSkus
          .map((sku) => `${getProduct(sku)?.name || sku} [${sku}]`)
          .join("; ")}`,
      );
    }
    messages.push({ role: "assistant", content: bits.join("\n") });
  }

  messages.push({
    role: "user",
    content: `${formatSuggestContext(sessionId)}\n\n${bagBlock}\nMandate: max ${mandateMaxRef()} remaining ${mandateRemainingRef()} (tokens).\nBag payable hint: ${pricedNow.payablePaise ? cartPayableRef() : "empty"}.\n\nBuyer message: ${text}`,
  });
  const acc: ToolAcc = { products: [], hintedSkus: [] };
  let toolsRan = false;

  const replyFromTools = (fallbackText: string): ChatMessage => {
    const { text: safeText } = finalizeAgentPrices(fallbackText, sessionId, acc.hintedSkus);
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: safeText,
      products: acc.products.length ? acc.products : undefined,
      showCart: acc.showCart || toolsRan,
      upsell: acc.upsell,
      crossSell: acc.crossSell?.length ? acc.crossSell : undefined,
      quote: acc.quote,
      offerNote: acc.offerNote,
    };
  };

  const model = process.env.OPENAI_MODEL || "gpt-4o";
  for (let i = 0; i < 6; i++) {
    let res: Response | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
        }),
      });
      if (res.ok) break;
      lastErr = await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
    if (!res || !res.ok) {
      writeAudit({
        sessionId,
        type: "agent.openai_error",
        explainable: true,
        bounded: true,
        gated: true,
        reason: `OpenAI HTTP ${res?.status || 0}.${toolsRan ? " Tools already ran — returning cart state." : " Falling back."}`,
        data: { status: res?.status, snippet: lastErr.slice(0, 160), toolsRan },
      });
      if (toolsRan) {
        const priced = priceCart(getCart(sessionId));
        const names = priced.lines.map((l) => l.name).join(", ") || "empty";
        const fallback =
          acc.lastTool === "remove_from_cart" && acc.lastRemovedName
            ? `Removed ${acc.lastRemovedName}. Bag is ${names}.`
            : `Updated your bag (${names}). Total ${cartPayableRef()}.`;
        return replyFromTools(fallback);
      }
      return null;
    }
    const data = (await res.json()) as {
      choices: Array<{ message: OaiMessage }>;
    };
    const msg = data.choices[0]?.message;
    if (!msg) {
      if (toolsRan) {
        const priced = priceCart(getCart(sessionId));
        const names = priced.lines.map((l) => l.name).join(", ") || "none";
        const fallback =
          acc.lastTool === "remove_from_cart" && acc.lastRemovedName
            ? `Removed ${acc.lastRemovedName}. Bag is ${names}.`
            : `Updated your bag. Total ${cartPayableRef()}. Lines: ${names}.`;
        return replyFromTools(fallback);
      }
      return null;
    }
    if (msg.tool_calls?.length) {
      toolsRan = true;
      messages.push(msg);
      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = await runTool(sessionId, call.function.name, args, acc);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }
    if (wantsPay && !acc.quote) {
      const result = await quoteCheckout(sessionId);
      if (result.status !== 400 && "u402Version" in result.body) {
        acc.quote = result.body;
        for (const l of result.body.breakdown.lines) hintSku(acc, l.sku);
      }
    }
    const rawText = stripClerkMarkdown(msg.content?.trim() || "Done.");
    const { text: safeText, scrubbed } = finalizeAgentPrices(rawText, sessionId, acc.hintedSkus);
    if (scrubbed) {
      writeAudit({
        sessionId,
        type: "agent.price_scrubbed",
        explainable: true,
        bounded: true,
        gated: true,
        reason: "Agent reply contained ₹ digits not in catalog/cart/mandate storage. Replaced with [store price].",
        data: { before: rawText.slice(0, 240), after: safeText.slice(0, 240) },
      });
    }
    const reply: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: safeText,
      products: acc.products.length ? acc.products : undefined,
      showCart: acc.showCart,
      upsell: acc.upsell,
      crossSell: acc.crossSell?.length ? acc.crossSell : undefined,
      quote: acc.quote,
      offerNote: acc.offerNote,
    };
    if (acc.products.length || acc.upsell || acc.crossSell?.length) {
      rememberSuggest(sessionId, {
        products: acc.products,
        upsell: acc.upsell,
        crossSell: acc.crossSell,
      });
    }
    return reply;
  }
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text: "I hit the tool loop limit. Try a shorter ask.",
    products: acc.products.length ? acc.products : undefined,
    showCart: acc.showCart,
    upsell: acc.upsell,
    crossSell: acc.crossSell?.length ? acc.crossSell : undefined,
    quote: acc.quote,
    offerNote: acc.offerNote,
  };
}
