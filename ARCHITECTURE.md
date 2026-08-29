# Architecture

## What this is

**Circuit** is a mandate-gated **agentic checkout** on Razorpay **test mode**.  
**u402** is the thin adapter shape: HTTP 402 quote + signed spend mandate + Razorpay Orders.

It is **protocol-shaped** (stable catalog / mandate / quote / audit contracts a third party could implement). It is **not** a finished open protocol for every website on the internet, and not a second-agent marketplace.

Track 01 bar: one buyer agent, money actions **explainable / bounded / gated**, visible **audit**, one **failure** handled gracefully.

## Why u402 (India)

x402 settles in USDC. ACP is Stripe-shaped. AP2 is card mandates. NPCI UAP is not live. Indian merchants settle on Razorpay. u402 adapts: signed mandate → gate → Razorpay test Order → human confirms the card (PCI).

## Layers

1. **Catalog** — agent-readable JSON (`GET /api/catalog`). The buyer agent only sees this.
2. **Buyer signing authority** — Ed25519 private key in `mandate-signer` / `POST /api/buyer/mandate/sign`. Issues / re-signs mandates. Merchant never holds this key.
3. **Merchant gate** — `mandate.ts` verifies with the **public** key only, then prices the cart. LLM never chooses the Order amount. Over remaining / expired / bad sig → **403**, no Order.
4. **Campaign orchestrator** — percent off by category/SKU, budget, dates. Applied before the gate.
5. **u402 quote** — 402 body with `order_id`, amount, key id, explanation; 403 may include `negotiate` counters for the **same** buyer agent.
6. **Razorpay** — Checkout + payment signature verify + payment fetch + webhooks.
7. **Audit** — append-only flight recorder (`/audit`). Live AOV from real captures; seed is baseline only until live rows exist.
8. **Gate lab** — `/lab` adversarial forge / replay / expire / bad webhook demos.

```mermaid
sequenceDiagram
  participant Human
  participant BuyerAgent as BuyerAgent
  participant Signer as BuyerSigner_Ed25519
  participant Merchant as MerchantGate
  participant Rzp as Razorpay_test

  Human->>BuyerAgent: Set spend cap / chat shop
  BuyerAgent->>Signer: Issue mandate
  Signer-->>Merchant: Signed mandate artifact
  Human->>BuyerAgent: Type pay
  BuyerAgent->>Merchant: quote_checkout
  Merchant->>Merchant: Verify public key; price cart
  alt over remaining or bad sig or expired
    Merchant-->>BuyerAgent: 403 plus negotiate tips
  else within mandate
    Merchant->>Rzp: orders.create
    Merchant-->>Human: 402 quote
    Human->>Rzp: Confirm card
    Rzp-->>Merchant: capture or fail
  end
```

## Stable surfaces (adapter contract)

| Surface | Shape |
| --- | --- |
| Catalog | `GET /api/catalog` products with `sku`, `pricePaise`, categories |
| Mandate | Claims + `alg` / `kid` / Ed25519 `signature` |
| Quote | `U402Quote` 402 `payment_required` or 403 blocked errors |
| Audit | Events with `explainable`, `bounded`, `gated`, `reason` |

**Third-party merchant would:** verify buyer public key → price locally → create Razorpay Order → return the same quote shape.  
**Third-party buyer would:** hold the private key → issue mandate → call catalog/checkout APIs.  
**This repo still couples:** Circuit UI + one Razorpay MID + in-process signer route (demo packaging).

## Money rules

- Mandate verify + audit before any Order create.
- Idempotent checkout ids. Failed checkout cannot be retried (stop rule).
- Decline / dismiss / expired: cart handling as documented; no retry storm.
- Remaining spend re-signed by buyer authority after capture.

## Failure demos

1. Razorpay test decline → `payment.failed` → stop rule.
2. Human closes Checkout → `checkout.dismissed`.
3. Expired mandate → `MANDATE_EXPIRED` (Gate lab).
4. Forged remaining / bad webhook → verify fail (Gate lab).

## Growth proof

`/audit` prefers **live** checkout rows (with vs without accepted upsell). Seeded baskets remain as synthetic baseline until the first live capture.

## Every shopping website?

No. Ubiquity means merchants (or a PSP/UAP rail) adopt the adapter — not one frontend scraping the open web. See TRACK01_VERIFICATION.md.
