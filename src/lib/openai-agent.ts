import { getProduct, searchCatalog } from "./catalog";
import { getCart, getMandateForSession, mutateCart } from "./cart";
import { quoteCheckout } from "./checkout";
import { formatInr } from "./money";
import { priceCart } from "./quote";
import { writeAudit } from "./audit";
import { enrichFromSearch, pickCartUpsell, pickPairs, stripClerkMarkdown, toCard } from "./recommend";
import type { ChatMessage, ChatProductCard, U402Quote } from "./types";

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
          budgetRupees: { type: "number", description: "Optional max price in rupees" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description: "Add a known SKU to the cart.",
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
      parameters: {
        type: "object",
        properties: { sku: { type: "string" } },
        required: ["sku"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cart",
      description: "See cart totals, campaign, and remaining mandate.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "quote_checkout",
      description:
        "Call when the buyer wants to pay, checkout, settle, or buy the cart. Server-prices the cart, checks the mandate, and creates a Razorpay test Order (HTTP 402). Never invent amounts. The client then opens Razorpay so a human can confirm the card — you cannot enter card data.",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;

type ToolAcc = {
  products: ChatProductCard[];
  upsell?: ChatProductCard;
  crossSell?: ChatProductCard[];
  quote?: U402Quote;
};

async function runTool(sessionId: string, name: string, args: Record<string, unknown>, acc: ToolAcc) {
  if (name === "search_catalog") {
    const query = String(args.query || "");
    const budget = typeof args.budgetRupees === "number" ? args.budgetRupees * 100 : undefined;
    const hits = searchCatalog(query, budget);
    const rec = enrichFromSearch(sessionId, hits, query, budget);
    acc.products = rec.products;
    acc.upsell = rec.upsell;
    acc.crossSell = rec.crossSell;
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
        priceInr: formatInr(p.pricePaise),
        pricePaise: p.pricePaise,
        short: p.short.slice(0, 80),
      })),
      upgrade: rec.upsell
        ? { sku: rec.upsell.sku, name: rec.upsell.name, priceInr: formatInr(rec.upsell.pricePaise) }
        : null,
      pairs: rec.crossSell.map((p) => ({
        sku: p.sku,
        name: p.name,
        priceInr: formatInr(p.pricePaise),
      })),
      note: "Use ONLY priceInr when saying a price. Never convert pricePaise yourself (paise = 1/100 rupee). UI already draws cards — 1–2 plain sentences.",
    };
  }
  if (name === "add_to_cart") {
    const sku = String(args.sku || "");
    const product = getProduct(sku);
    if (!product) return { error: `Unknown SKU ${sku}` };
    mutateCart(sessionId, "add", sku, Number(args.qty) || 1);
    acc.products = [toCard(product)];
    acc.upsell = pickCartUpsell(sessionId);
    const remaining = getMandateForSession(sessionId).remainingPaise - priceCart(getCart(sessionId)).payablePaise;
    acc.crossSell = pickPairs([product], remaining, new Set(getCart(sessionId).map((l) => l.sku))).map(toCard);
    const priced = priceCart(getCart(sessionId));
    return {
      ok: true,
      name: product.name,
      priceInr: formatInr(product.pricePaise),
      cartPayableInr: formatInr(priced.payablePaise),
      upgrade: acc.upsell
        ? { name: acc.upsell.name, priceInr: formatInr(acc.upsell.pricePaise) }
        : null,
      pairs: acc.crossSell.map((p) => ({ name: p.name, priceInr: formatInr(p.pricePaise) })),
    };
  }
  if (name === "remove_from_cart") {
    const sku = String(args.sku || "");
    mutateCart(sessionId, "remove", sku);
    return { ok: true };
  }
  if (name === "get_cart") {
    const mandate = getMandateForSession(sessionId);
    const priced = priceCart(getCart(sessionId));
    return {
      lines: priced.lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        priceInr: formatInr(l.linePaise),
      })),
      payableInr: formatInr(priced.payablePaise),
      remainingInr: formatInr(mandate.remainingPaise),
      maxInr: formatInr(mandate.maxPaise),
    };
  }
  if (name === "quote_checkout") {
    const result = await quoteCheckout(sessionId);
    if (result.status === 400) return result.body;
    acc.quote = result.body;
    return result.body;
  }
  return { error: `Unknown tool ${name}` };
}

type OaiMessage = {
  role: string;
  content?: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

export async function runOpenAIBuyer(sessionId: string, text: string): Promise<ChatMessage | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const mandate = getMandateForSession(sessionId);
  const wantsPay = /\b(pay|checkout|place order|buy now|settle|complete payment)\b/i.test(text);
  const system = `You are the buyer agent for Circuit, a gaming desk store in Bengaluru.
You shop and you settle. Never invent SKUs or prices.
CRITICAL: Tool results include priceInr (e.g. "₹599"). Quote ONLY those strings. Never do math on pricePaise — paise are 1/100 of a rupee (59900 paise = ₹599, NOT ₹5,990).
Buyer spend is gated by a signed mandate the human set: max ${formatInr(mandate.maxPaise)}, remaining ${formatInr(mandate.remainingPaise)}.
If they want an Obsidian monitor or a chair over remaining budget, say so and do not fight the gate.
The UI already renders product cards. Your text is 1–2 short sentences. No markdown, no **stars**, no Price/Short lists.
Always mention a step-up (upgrade) and one pair-with item when the tool returns them.
When they want to pay / checkout / settle / buy the cart, you MUST call quote_checkout. Do not tell them to click a Checkout button.
After a 402, say you created the Razorpay Order and a human must confirm the card in Razorpay (PCI). You never enter card numbers.
After a 403 (mandate_exceeded / expired / bad signature), no Order was created. If the quote includes negotiate suggestions, propose ONE concrete counter in your own voice (remove X or swap to Y) and offer to apply it with tools — you are still the same buyer agent, not a second negotiator.
If mandate expired, tell them to re-authorise a spend cap in Cart.`;

  const messages: OaiMessage[] = [
    { role: "system", content: system },
    { role: "user", content: text },
  ];
  const acc: ToolAcc = { products: [] };

  for (let i = 0; i < 6; i++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      writeAudit({
        sessionId,
        type: "agent.openai_error",
        explainable: true,
        bounded: true,
        gated: true,
        reason: `OpenAI HTTP ${res.status}. Falling back to the rule agent.`,
        data: { status: res.status, snippet: err.slice(0, 160) },
      });
      return null;
    }
    const data = (await res.json()) as {
      choices: Array<{ message: OaiMessage }>;
    };
    const msg = data.choices[0]?.message;
    if (!msg) return null;
    if (msg.tool_calls?.length) {
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
      if (result.status !== 400) acc.quote = result.body;
    }
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: stripClerkMarkdown(msg.content?.trim() || "Done."),
      products: acc.products.length ? acc.products : undefined,
      upsell: acc.upsell,
      crossSell: acc.crossSell?.length ? acc.crossSell : undefined,
      quote: acc.quote,
    };
  }
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text: "I hit the tool loop limit. Try a shorter ask.",
    products: acc.products.length ? acc.products : undefined,
    upsell: acc.upsell,
    crossSell: acc.crossSell?.length ? acc.crossSell : undefined,
    quote: acc.quote,
  };
}
