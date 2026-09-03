# 5-minute pitch

0:00 Problem. Agents cannot buy from a normal Indian merchant. Protocols are US/crypto. UAP is not live. Razorpay needs a common MCP rail for every builder-made shop.

0:30 Identity. Shopper registers a unique username. Agent holds `shopper_token`. Budget signed before cart unlocks. Carts stay tracked per shopper.

1:00 Happy path (UI). Search → add → pay → 402 → Razorpay → order done. LLM never set the amount (price tokens + server `priceCart`).

1:40 MCP. Claude Desktop / any agent: same tools, same Gate. `quote_checkout` returns Payment Link for the human. Discovery at `/.well-known/agent-commerce.json`.

2:20 Inspector. Ed25519 sign vs verify. Hash-chained audit. Underpay lab still quotes real cart. Double capture debits once. We don’t sticker-count “gates” — the rail is fail-closed (keys never leave the server, agent can’t invent Order amounts). Same bar as loud security demos; plus live shop + MCP discovery.

2:50 Gate. Over mandate → 403 + negotiate. No Order.

3:20 Failure. Decline / dismiss. Cart intact.

3:40 Growth. `/audit` live AOV.

4:00 Thesis. u402 MCP = what Razorpay website builder should ship so every merchant is AI-transactable. Circuit is the reference implementation — not WhatsApp glue. Persistence is one JSON document on purpose (Mongo-ready later) so the demo proves the gate, not a database.

4:40 Ask. Hire the intern who built the rail, not another chat widget.
