/**
 * MCP tool handlers — same money path as HTTP APIs. Never a second door.
 */
import { searchCatalog, getProduct } from "../catalog";
import { getCart, getMandateForSession, mutateCart } from "../cart";
import { quoteCheckout } from "../checkout";
import { priceCart } from "../quote";
import { listAudit, verifyAuditChain } from "../audit";
import { buildNegotiate } from "../negotiate";
import { listMerchants, assertMerchant } from "../merchants";
import {
  authenticateShopper,
  loginShopper,
  registerShopper,
  requireBudget,
  setShopperBudget,
} from "../shoppers";
import { formatInr } from "../money";
import { pRef, cartPayableRef, mandateRemainingRef, mandateMaxRef } from "../price-refs";
import { getDb } from "../store";

export type McpToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(message: string, extra?: Record<string, unknown>): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: message, ...extra }, null, 2) }],
  };
}

function tokenOf(args: Record<string, unknown>): string | undefined {
  const t = args.shopper_token ?? args.shopperToken;
  return typeof t === "string" ? t : undefined;
}

export const MCP_TOOL_DEFS = [
  {
    name: "register_shopper",
    description:
      "Register a unique shopper username on this Razorpay merchant (Circuit). Returns shopper_token once — store it and pass on every later tool call. Human knows the username; agent holds the token.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "3–32 chars lowercase [a-z0-9_]" },
        merchant_id: { type: "string", description: "Optional; defaults to mer_circuit" },
      },
      required: ["username"],
    },
  },
  {
    name: "login_shopper",
    description: "Restore cart and mandate for an existing username + shopper_token.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string" },
        shopper_token: { type: "string" },
      },
      required: ["username", "shopper_token"],
    },
  },
  {
    name: "set_budget",
    description:
      "REQUIRED before cart/checkout. Sets Ed25519-signed spend mandate (max rupees, full remaining reset).",
    inputSchema: {
      type: "object",
      properties: {
        shopper_token: { type: "string" },
        max_rupees: { type: "number", description: "Budget in INR, e.g. 8000" },
      },
      required: ["shopper_token", "max_rupees"],
    },
  },
  {
    name: "list_merchants",
    description: "List merchants exposing this u402 MCP rail (Circuit is the reference shop).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "search_catalog",
    description: "Search catalog after register. Prices are server tokens — never invent ₹ amounts.",
    inputSchema: {
      type: "object",
      properties: {
        shopper_token: { type: "string" },
        query: { type: "string" },
        budget_rupees: { type: "number", description: "Optional filter only — not Order amount" },
      },
      required: ["shopper_token", "query"],
    },
  },
  {
    name: "get_cart",
    description: "Cart + mandate remaining. Requires shopper_token and set_budget.",
    inputSchema: {
      type: "object",
      properties: { shopper_token: { type: "string" } },
      required: ["shopper_token"],
    },
  },
  {
    name: "add_to_cart",
    description: "Add SKU from catalog. Requires budget. Cannot set price.",
    inputSchema: {
      type: "object",
      properties: {
        shopper_token: { type: "string" },
        sku: { type: "string" },
        qty: { type: "number" },
      },
      required: ["shopper_token", "sku"],
    },
  },
  {
    name: "remove_from_cart",
    inputSchema: {
      type: "object",
      properties: { shopper_token: { type: "string" }, sku: { type: "string" } },
      required: ["shopper_token", "sku"],
    },
  },
  {
    name: "clear_cart",
    inputSchema: {
      type: "object",
      properties: { shopper_token: { type: "string" } },
      required: ["shopper_token"],
    },
  },
  {
    name: "quote_checkout",
    description:
      "Server-prices cart, gates mandate, creates Razorpay Order (HTTP 402) + Payment Link for the human. No amount args.",
    inputSchema: {
      type: "object",
      properties: { shopper_token: { type: "string" } },
      required: ["shopper_token"],
    },
  },
  {
    name: "get_negotiate_tips",
    description: "If last quote was 403 mandate exceeded, return cut/swap suggestions.",
    inputSchema: {
      type: "object",
      properties: { shopper_token: { type: "string" } },
      required: ["shopper_token"],
    },
  },
  {
    name: "get_audit",
    description: "Recent audit trail + hash-chain verify status for this shopper session.",
    inputSchema: {
      type: "object",
      properties: { shopper_token: { type: "string" }, limit: { type: "number" } },
      required: ["shopper_token"],
    },
  },
] as const;

export async function runMcpTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    if (name === "list_merchants") {
      return ok({ merchants: listMerchants() });
    }
    if (name === "register_shopper") {
      const result = registerShopper({
        username: String(args.username || ""),
        merchantId: typeof args.merchant_id === "string" ? args.merchant_id : undefined,
      });
      if (!result.ok) return err(result.message, { code: result.error });
      return ok({
        ...result,
        note: "Save shopper_token. Pass it on every later tool. Then call set_budget before cart.",
      });
    }
    if (name === "login_shopper") {
      const result = loginShopper({
        username: String(args.username || ""),
        shopperToken: String(args.shopper_token || ""),
      });
      if (!result.ok) return err(result.message, { code: result.error });
      return ok({
        username: result.username,
        session_id: result.session.id,
        budget_set: Boolean(result.session.budgetSet),
        merchant_id: result.session.merchantId,
      });
    }
    if (name === "set_budget") {
      const result = setShopperBudget({
        shopperToken: String(args.shopper_token || ""),
        maxRupees: Number(args.max_rupees),
      });
      if (!result.ok) return err(result.message, { code: result.error });
      return ok({
        username: result.username,
        max: mandateMaxRef(),
        remaining: mandateRemainingRef(),
        max_inr: formatInr(result.mandate.maxPaise),
        budget_set: true,
      });
    }

    const token = tokenOf(args);
    const auth = authenticateShopper(token);
    if (!auth.ok) return err(auth.message, { code: auth.error });

    if (name === "search_catalog") {
      assertMerchant(auth.session.merchantId);
      const query = String(args.query || "");
      const budget =
        typeof args.budget_rupees === "number" ? args.budget_rupees * 100 : undefined;
      const hits = searchCatalog(query, budget).slice(0, 8);
      return ok({
        username: auth.username,
        matches: hits.map((p) => ({
          sku: p.sku,
          name: p.name,
          price: pRef(p.sku),
          price_inr: formatInr(p.pricePaise),
        })),
        note: "Use sku with add_to_cart. Prefer price tokens in speech.",
      });
    }

    if (name === "get_audit") {
      const limit = Math.min(40, Number(args.limit) || 20);
      const rows = listAudit(80).filter((r) => r.sessionId === auth.session.id).slice(0, limit);
      return ok({ username: auth.username, chain: verifyAuditChain(), events: rows });
    }

    const budgetGate = requireBudget(auth.session);
    if (budgetGate && ["get_cart", "add_to_cart", "remove_from_cart", "clear_cart", "quote_checkout", "get_negotiate_tips"].includes(name)) {
      return err(budgetGate.message, { code: budgetGate.error });
    }

    const sessionId = auth.session.id;

    if (name === "get_cart") {
      const priced = priceCart(getCart(sessionId));
      const mandate = getMandateForSession(sessionId);
      return ok({
        username: auth.username,
        lines: priced.lines.map((l) => ({
          sku: l.sku,
          name: l.name,
          qty: l.qty,
          price_inr: formatInr(l.linePaise),
        })),
        payable: cartPayableRef(),
        payable_inr: formatInr(priced.payablePaise),
        remaining_inr: formatInr(mandate.remainingPaise),
      });
    }
    if (name === "add_to_cart") {
      const sku = String(args.sku || "");
      if (!getProduct(sku)) return err(`Unknown SKU ${sku}`);
      mutateCart(sessionId, "add", sku, Number(args.qty) || 1);
      const priced = priceCart(getCart(sessionId));
      return ok({
        ok: true,
        sku,
        name: getProduct(sku)!.name,
        cart_payable_inr: formatInr(priced.payablePaise),
      });
    }
    if (name === "remove_from_cart") {
      mutateCart(sessionId, "remove", String(args.sku || ""));
      return ok({ ok: true });
    }
    if (name === "clear_cart") {
      mutateCart(sessionId, "clear");
      return ok({ ok: true });
    }
    if (name === "quote_checkout") {
      if (
        typeof args.amountPaise === "number" ||
        typeof args.amount === "number" ||
        typeof args.payablePaise === "number"
      ) {
        return err("Amount args forbidden — server prices the cart only.", {
          code: "AMOUNT_INJECTION",
        });
      }
      const result = await quoteCheckout(sessionId);
      if (result.status === 400) return err(String((result.body as { error?: string }).error));
      const body = result.body as {
        error?: string;
        paymentLinkUrl?: string;
        accepts?: Array<{ orderId?: string; checkoutId?: string; paymentLinkUrl?: string; amountPaise?: number }>;
        breakdown?: { payablePaise?: number; explanation?: string };
        negotiate?: unknown;
        mandate?: unknown;
      };
      return ok({
        http_status: result.status,
        error: body.error,
        payable_inr: body.breakdown?.payablePaise != null ? formatInr(body.breakdown.payablePaise) : null,
        payment_link_url: body.paymentLinkUrl || body.accepts?.[0]?.paymentLinkUrl || null,
        order_id: body.accepts?.[0]?.orderId,
        checkout_id: body.accepts?.[0]?.checkoutId,
        explanation: body.breakdown?.explanation,
        negotiate: body.negotiate,
        mandate: body.mandate,
        note:
          result.status === 402
            ? body.paymentLinkUrl || body.accepts?.[0]?.paymentLinkUrl
              ? "Hand payment_link_url to the human. There is NO payment_id yet — that appears only after they pay. You never enter card data."
              : "Order created but Payment Link missing. Tell the human to open Circuit /shop (same shopper), type pay, and confirm in Razorpay Checkout. payment_id only exists after capture."
            : "No Order created. Use get_negotiate_tips or adjust cart.",
      });
    }
    if (name === "get_negotiate_tips") {
      const session = getDb().sessions[sessionId];
      const quote = session?.lastQuote;
      if (!quote || quote.error === "payment_required") {
        const mandate = getMandateForSession(sessionId);
        const priced = priceCart(getCart(sessionId));
        const tips = buildNegotiate(mandate, priced.lines, priced.payablePaise);
        return ok({ tips });
      }
      return ok({ tips: quote.negotiate || [] });
    }

    return err(`Unknown tool ${name}`);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
