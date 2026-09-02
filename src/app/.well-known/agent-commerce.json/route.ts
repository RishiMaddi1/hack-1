import { NextResponse } from "next/server";
import { MERCHANT_ID, MERCHANT_NAME } from "@/lib/catalog";
import { listMerchants } from "@/lib/merchants";

/**
 * Agent discovery — any AI shopper finds how to register, set budget, and MCP-shop.
 * Thesis: Razorpay website builder sites expose this shape → AI-transactable.
 */
export async function GET() {
  return NextResponse.json({
    protocol: "u402",
    version: 1,
    merchant: { id: MERCHANT_ID, name: MERCHANT_NAME },
    merchants: listMerchants(),
    mcp: {
      http: "/api/mcp",
      stdio: "npm run mcp:stdio",
      note: "MCP is a transport — same Gate as /api/*",
    },
    flow: [
      { step: 1, tool: "register_shopper", require: "unique username" },
      { step: 2, tool: "set_budget", require: "max_rupees before cart" },
      { step: 3, tool: "search_catalog / add_to_cart" },
      { step: 4, tool: "quote_checkout", result: "402 + payment_link_url for human" },
    ],
    endpoints: {
      catalog: "/api/catalog",
      shoppers: "/api/shoppers",
      cart: "/api/cart",
      checkout: "/api/checkout",
      audit: "/api/audit",
    },
    rules: [
      "Every shopper registers a unique username; agent holds shopper_token.",
      "Budget (Ed25519 mandate) must be set before cart or checkout.",
      "LLM never sets Order amount — server prices from catalog.",
      "Human confirms payment via Razorpay Checkout or Payment Link.",
      "WhatsApp is not part of this protocol.",
    ],
  });
}
