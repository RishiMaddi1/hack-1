import { getProduct, searchCatalog } from "./catalog";
import { getCart, getMandateForSession, mutateCart } from "./cart";
import { quoteCheckout } from "./checkout";
import { writeAudit } from "./audit";
import { priceCart } from "./quote";
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
      description: "Add a known SKU to the cart. Price comes from catalog storage — you cannot set it.",
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
      description: "See cart lines and mandate caps as price tokens (server-resolved).",
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
  upsell?: ChatProductCard;
  crossSell?: ChatProductCard[];
  quote?: U402Quote;
  hintedSkus: string[];
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
    const sku = String(args.sku || "");
    mutateCart(sessionId, "remove", sku);
    return { ok: true };
  }
  if (name === "get_cart") {
    const priced = priceCart(getCart(sessionId));
    for (const l of priced.lines) hintSku(acc, l.sku);
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
      note: PRICE_TOKEN_HELP,
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

export async function runOpenAIBuyer(sessionId: string, text: string): Promise<ChatMessage | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const wantsPay = /\b(pay|checkout|place order|buy now|settle|complete payment)\b/i.test(text);
  const system = `You are the buyer agent for Circuit, a gaming desk store in Bengaluru.
You shop and you settle. Never invent SKUs.
PRICE SECURITY: ${PRICE_TOKEN_HELP}
Example: "Harpy is {{p:harpy-black-light-weight-rgb-gaming-mouse}}." Never "Harpy is ₹599" or any other digits.
Buyer spend is gated by a signed mandate: max {{mandate.max}}, remaining {{mandate.remaining}} (tokens — do not invent numbers).
If they want an Obsidian monitor or a chair over remaining budget, say so and do not fight the gate.
The UI already renders product cards. Your text is 1–2 short sentences. No markdown, no **stars**, no Price/Short lists.
Always mention a step-up (upgrade) and one pair-with item when the tool returns them — use their price tokens.
When they want to pay / checkout / settle / buy the cart, you MUST call quote_checkout with NO arguments. Do not tell them to click a Checkout button. Never pass amount/price fields.
After a 402, say you created the Razorpay Order for {{cart.payable}} and a human must confirm the card in Razorpay (PCI). You never enter card numbers.
After a 403 (mandate_exceeded / expired / bad signature), no Order was created. If negotiate tips appear in tools, propose ONE concrete counter and apply it with tools — same buyer agent, not a second negotiator.
If mandate expired, tell them to re-authorise a spend cap in Cart.`;

  const messages: OaiMessage[] = [
    { role: "system", content: system },
    { role: "user", content: text },
  ];
  const acc: ToolAcc = { products: [], hintedSkus: [] };

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
      if (result.status !== 400) {
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
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: safeText,
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
