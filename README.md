# u402 — Circuit

Razorpay AI Buildathon · Track 01 · AI Growth & Agentic Commerce

**Mandate-gated agentic checkout** + **MCP rail** so any AI shopper can transact. Shoppers **register a unique username**, **set a budget**, then shop. The server prices the cart, verifies an Ed25519 spend mandate, and creates a Razorpay Order (HTTP 402) + Payment Link. Human confirms. Hash-chained `/audit`.

**Security (quiet, not a sticker row):** fail-closed on the money path — Ed25519 mandate, catalog prices only, Razorpay keys/HMAC server-side, 403 over cap, capture-once, hash-chained audit. Circuit ships the live shop, MCP discovery, upsell/campaigns, and abandoned-cart rail in one clean product. See `/lab` → *What's gated*.

Thesis: Razorpay website builder ships this MCP shape → every merchant becomes AI-transactable. Circuit is the reference shop. Not WhatsApp. Not "works on every website without adopting the shape."

## Run

```bash
cp .env.example .env.local
# paste rzp_test_ Key ID + Key Secret (+ optional OpenAI + mandate keypair)
npm install
npm run dev
```

Open [http://localhost:3000/shop](http://localhost:3000/shop) → register username → set budget → shop.

- MCP HTTP: `GET/POST /api/mcp`
- Discovery: `/.well-known/agent-commerce.json`
- Gate lab: [/lab](http://localhost:3000/lab)
- Audit + hash chain: [/audit](http://localhost:3000/audit)

### Claude Desktop / any MCP client (stdio)

```bash
npm run mcp:stdio
```

Config sketch:

```json
{
  "mcpServers": {
    "circuit-u402": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp-server.ts"],
      "cwd": "/path/to/hack-1"
    }
  }
}
```

Or HTTP: `POST http://localhost:3000/api/mcp` with JSON-RPC `tools/list` / `tools/call`.

Flow: `register_shopper` → save `shopper_token` → `set_budget` → `search_catalog` → `add_to_cart` → `quote_checkout` → hand `payment_link_url` to human.

Optional `MCP_SHARED_SECRET` → `Authorization: Bearer …` on `/api/mcp`.

## Demo script

1. Register as `demo_buyer`, set budget ₹8000
2. Shop: *Swarm keyboard and Harpy mouse under ₹5000* → pay → Razorpay
3. Over-mandate → 403 + negotiate
4. MCP Inspector / Claude: same tools, Payment Link handoff
5. `/lab` underpay + double-capture
6. `/audit` chain OK + live AOV

## Stack

Next.js · TypeScript · Razorpay · Ed25519 · `@modelcontextprotocol/sdk` · hash-chained audit

**Persistence (intentional):** runtime state is one JSON document (`data/runtime.json` via `src/lib/store.ts`) — shoppers, carts, mandates, audit, campaigns. Same document shape drops into MongoDB as one collection later; we did **not** spend the buildathon on ORM/DB ops because the hard parts are mandate + MCP + 402 + Razorpay, not swapping a file for a document DB.

See [ARCHITECTURE.md](ARCHITECTURE.md), [PITCH.md](PITCH.md), [TRACK01_VERIFICATION.md](TRACK01_VERIFICATION.md).
