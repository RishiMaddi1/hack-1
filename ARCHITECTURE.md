# Architecture

## Why u402

x402 settles in USDC. ACP is Stripe. AP2 is card mandates. NPCI UAP is not live. Indian merchants settle on Razorpay. u402 is the adapter: HTTP 402 + signed mandate + Razorpay test Orders.

## Layers

1. **Catalog** — JSON product feed (`GET /api/catalog`). The buyer agent only sees this.
2. **Mandate** — HMAC-signed Intent: agent, merchant, max paise, remaining, expiry, categories.
3. **Campaign orchestrator** — percent off by category/SKU, budget, dates. Applied before the gate.
4. **Gate** — server prices the cart. LLM never chooses the Order amount. Over-mandate → 403, no Order.
5. **u402 quote** — 402 body with `order_id`, amount, key id, explanation.
6. **Razorpay** — Checkout + signature verify + payment fetch + webhooks.
7. **Audit** — append-only flight recorder (`/audit`).

## Money rules

- Mandate check + audit event before any Order create.
- Idempotent checkout ids. Failed checkout cannot be retried (stop rule).
- Decline: one attempt, cart intact, no second Order.

## Failure demo

Razorpay test decline → `payment.failed` audit → agent/UI explains → stop.

## Growth proof

Ten seeded sessions on `/audit`: AOV with vs without bounded upsell.
