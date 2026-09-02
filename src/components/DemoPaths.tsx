"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function mcpConfigSnippet(origin: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "circuit-u402": {
          url: `${origin}/api/mcp`,
        },
      },
    },
    null,
    2,
  );
}

function detailedAgentPrompt(origin: string) {
  return `You are an AI shopper for Circuit — a Kreo gaming-desk merchant on Razorpay test mode (protocol u402).

BASE
- Origin: ${origin}
- MCP / tools: ${origin}/api/mcp
- Discovery: ${origin}/.well-known/agent-commerce.json
- If the host is ngrok, send header: ngrok-skip-browser-warning: true on every request.

YOU DO NOT NEED A PRE-WIRED MCP CLIENT. Call the HTTP API directly (curl, fetch, etc.).

HOW TO CALL TOOLS (pick one style)

A) Simple REST (easiest)
POST ${origin}/api/mcp
Content-Type: application/json
Body: { "tool": "<name>", "arguments": { ... } }

B) JSON-RPC (MCP-shaped)
POST ${origin}/api/mcp
Content-Type: application/json
Body: {
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "<name>", "arguments": { ... } }
}

List tools anytime:
GET ${origin}/api/mcp
or POST { "jsonrpc":"2.0","id":1,"method":"tools/list" }

BUY FLOW (always this order)

1) register_shopper
   arguments: { "username": "<unique lowercase a-z0-9_>" }
   → save shopper_token from the response. Pass it on every later call.

2) set_budget  (REQUIRED before cart)
   arguments: { "shopper_token": "<token>", "max_rupees": 8000 }
   → Ed25519 spend mandate. No budget → cart/checkout blocked.

3) search_catalog
   arguments: { "shopper_token": "<token>", "query": "<what buyer wants>", "budget_rupees": <optional filter only> }
   → Use returned SKUs. Never invent ₹ Order amounts.

4) add_to_cart
   arguments: { "shopper_token": "<token>", "sku": "<exact sku>", "qty": 1 }

5) get_cart (optional check)
   arguments: { "shopper_token": "<token>" }

6) quote_checkout
   arguments: { "shopper_token": "<token>" }
   → HTTP 402 path: Razorpay Order + payment_link_url.
   → Hand payment_link_url / order id to the HUMAN. You do not enter card details.
   → Never pass amount/price into quote_checkout — server prices the cart.

If quote is 403 (mandate exceeded / expired / bad signature):
- call get_negotiate_tips with shopper_token, or remove/swap items, or ask human to raise budget via set_budget.

OTHER TOOLS
- remove_from_cart, clear_cart, login_shopper, list_merchants, get_audit

RULES
- Never invent Order amounts or SKUs
- Stay under the signed mandate
- Human confirms payment on Razorpay (Checkout or Payment Link)
- When done, report: Payment Link, Order id, Checkout id, and what is in the bag

Start by registering a fresh username, set budget 8000, then shop for whatever I ask next.`;
}

export function DemoPaths() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<"mcp" | "prompt" | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const host = origin || "https://<this-host>";

  async function copy(kind: "mcp" | "prompt", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-6 grid gap-3 md:grid-cols-2">
      <div className="flex flex-col border border-fg/20 bg-bg p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">In the browser</p>
        <p className="mt-1.5 font-[family-name:var(--font-serif)] text-xl text-fg">Shop + buyer agent</p>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
          Register, set a budget, chat or click products, type{" "}
          <span className="font-mono text-fg">pay</span>, confirm the card. You’ll see the HTTP 402
          quote card, then the paid receipt.
        </p>
        <Link
          href="/shop"
          className="mt-4 inline-flex w-fit bg-fg px-3 py-2 text-sm text-bg transition-opacity hover:opacity-90"
        >
          Enter the shop
        </Link>
      </div>

      <div className="flex flex-col border border-line bg-bg p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">From an AI</p>
        <p className="mt-1.5 font-[family-name:var(--font-serif)] text-xl text-fg">Wire an agent</p>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
          Copy the MCP snippet into Cursor (or any MCP client), or copy the full prompt so an agent
          can hit the HTTP tools with no MCP install.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copy("mcp", mcpConfigSnippet(host))}
            className="inline-flex border border-fg px-3 py-2 text-xs text-fg transition-colors hover:bg-fg hover:text-bg"
          >
            {copied === "mcp" ? "Copied" : "Copy MCP config"}
          </button>
          <button
            type="button"
            onClick={() => void copy("prompt", detailedAgentPrompt(host))}
            className="inline-flex bg-fg px-3 py-2 text-xs text-bg transition-opacity hover:opacity-90"
          >
            {copied === "prompt" ? "Copied" : "Copy full agent prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}
