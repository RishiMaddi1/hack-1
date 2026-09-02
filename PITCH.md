# 5-minute pitch

0:00 Problem. Agents cannot buy from a normal Indian merchant. Protocols are US/crypto. UAP is not live. We need mandate-gated checkout on Razorpay.

0:40 Happy path. One buyer agent: “Swarm keyboard and Harpy mouse under ₹5000” → cards → add → mousepad upsell inside the cap → type **pay** → 402 → Razorpay test pay → dashboard `order_` / `pay_` tick. Chat announces order done.

1:40 Inspector. Buyer-signed mandate (Ed25519) vs merchant public-key verify. 402 body, explanation, audit trail. LLM never picked the amount.

2:20 Decline or dismiss. Test failure card or close Checkout. Agent/UI stops. Audit `payment.failed` or `checkout.dismissed`. Cart not duplicated.

2:50 Gate. “Add the Obsidian 27-inch.” Type pay → 403. Same agent offers a substitute (negotiate). No Order in dashboard.

3:20 Lab. Forge remaining without re-sign → verify fail. Expire mandate → blocked. Signature is load-bearing. Underpay attempt still quotes the real cart. Double capture still debits once.

3:50 Growth. `/audit` live AOV with vs without bounded upsell (after real captures).

4:20 Architecture one-liner. u402 = adapter (catalog + mandate + 402 quote) for Razorpay — not every website; merchants adopt the shape.

4:50 Ask. This is the intern who already built the Razorpay-shaped, mandate-gated agentic checkout.
