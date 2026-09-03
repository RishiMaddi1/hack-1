# Track 01 verification — Circuit (u402)

**For the verifying agent:** check each requirement against the code paths and smoke steps below. Do not treat marketing copy as proof — open the cited files and run the checks.

| Field | Value |
| --- | --- |
| Product | **Circuit** (merchant shop) · protocol layer **u402** |
| Track | Razorpay AI Buildathon · **01 — AI Growth & Agentic Commerce** |
| Stack | Next.js 16 · TypeScript · Razorpay Node SDK (test mode) · optional OpenAI tools agent · **document store** (`runtime.json` → Mongo-ready) |
| Official bar (razorpay.com/buildathon) | Every money action **explainable, bounded and gated**. Show the **audit trail** and **one failure handled gracefully**. |
| Build goal (official) | Agent that grows merchant revenue on Razorpay **test-mode** APIs, **or** makes a merchant **transactable by an AI buyer end to end**. |

Example directions claimed: conversational in-app checkout · agent-readable catalog · upsell & cross-sell · campaign orchestrator.

---

## How to run before verifying

```bash
cp .env.example .env.local   # or use existing .env
# RAZORPAY_KEY_ID must start with rzp_test_
# RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
# BUYER_MANDATE_*_B64 optional (demo Ed25519 keys embedded)
# OPENAI_API_KEY optional (falls back to rule-based agent in src/lib/agent.ts)
npm install
npm run dev
```

- Shop UI: `http://localhost:3000/shop`
- Audit UI: `http://localhost:3000/audit`
- Gate lab: `http://localhost:3000/lab`
- Catalog JSON: `GET /api/catalog`
- Campaigns: `http://localhost:3000/campaigns`
- Buyer sign: `POST /api/buyer/mandate/sign`
- Shoppers: `POST /api/shoppers` (`register` | `login` | `set_budget` | `me`)
- MCP: `GET/POST /api/mcp` · stdio `npm run mcp:stdio`
- Discovery: `/.well-known/agent-commerce.json`
- Webhook: `POST /api/webhooks/razorpay` (needs public URL + dashboard secret)

**Framing:** mandate-gated agentic checkout + MCP rail; u402 is the adapter shape for Razorpay-builder merchants — not every website without adopting it. Shoppers register a username and set budget before cart. One buyer agent / MCP client (no second LLM). No WhatsApp.

---

## A. Official Track 01 bar (must pass)

### A0. Shopper identity + budget-before-shop

| | |
| --- | --- |
| **Claim** | Unique username + `shopper_token`; `set_budget` required before cart/checkout; MCP uses the same gate. |
| **Code** | `src/lib/shoppers.ts` · `src/app/api/shoppers/route.ts` · `src/lib/mcp/handlers.ts` · `ShopperGate.tsx` |
| **Verify** | Register on `/shop`. MCP `add_to_cart` without `set_budget` → `BUDGET_REQUIRED`. Login restores cart. |
| **Pass if** | Unauthenticated / no-budget cart fails closed. |

### A1. Merchant transactable by an AI buyer end to end

| | |
| --- | --- |
| **Claim** | Buyer talks in chat (or clicks Add). Agent searches catalog, adds SKUs, proposes bounded upsell, calls `quote_checkout`. Server prices + gates + creates Razorpay Order (HTTP 402). Human confirms card in Razorpay Checkout (PCI). Confirm verifies signature; mandate remaining decreases; cart clears; chat announces order/payment IDs. |
| **Code** | `src/lib/openai-agent.ts` (tools: `search_catalog`, `add_to_cart`, `get_cart`, `quote_checkout`) · fallback `src/lib/agent.ts` · `src/lib/checkout.ts` · `src/lib/razorpay.ts` · `src/components/ShopProvider.tsx` (`send`, `openRazorpayForQuote`) · `src/components/Drawers.tsx` (402 quote card in Ask drawer) |
| **Verify** | 1) Open `/shop`, Ask drawer open. 2) Type a catalog query (e.g. keyboard under budget). 3) Add via agent or tile. 4) Type **pay**. 5) Expect 402 card with real `order_…` when test keys present. 6) Pay with test card `4111 1111 1111 1111`. 7) Chat shows order done + `order_…` / `pay_…`. 8) Same IDs in Razorpay Dashboard → Test Mode → Orders/Payments. |
| **Pass if** | Live `order_` / `pay_` IDs match dashboard; LLM never invented the Order amount. |

### A2. Every money action is **explainable**

| | |
| --- | --- |
| **Claim** | Checkout builds a human-readable `explanation` from line items + campaign + gate reason. 402/403 bodies include `breakdown`. Audit rows store `reason` + `explainable: true`. UI shows explanation on quote card and `/audit`. |
| **Code** | `src/lib/quote.ts` → `explainMoney` · `src/lib/checkout.ts` → `quoteCheckout` / `confirmCheckout` · `src/lib/types.ts` → `U402Quote` · `src/app/audit/page.tsx` |
| **Verify** | After **pay**, inspect chat 402 card text and `GET /api/audit` — reason strings name SKUs, rupees, mandate remaining. |
| **Pass if** | Every money event has a non-empty `reason` an engineer can read without guessing. |

### A3. Every money action is **bounded**

| | |
| --- | --- |
| **Claim** | Human sets a spend **mandate** signed by **buyer Ed25519 authority** (`mandate-signer`). Merchant verifies with **public key only**. Default demo cap ₹8,000. Remaining decreases on capture (re-signed). Upsells refused when they would exceed remaining. |
| **Code** | `src/lib/mandate-signer.ts` · `src/lib/mandate.ts` · `src/app/api/buyer/mandate/sign/route.ts` · Cart chips · `src/lib/recommend.ts` |
| **Verify** | Cart → raise/lower cap. `/lab` → forge remaining → `mandate.verify_fail`. Partial pay → remaining shrinks. |
| **Pass if** | Agent cannot create an Order above remaining; forged remaining without re-sign fails verify. |

### A4. Every money action is **gated**

| | |
| --- | --- |
| **Claim** | Gate runs **before** `orders.create`. Block → **403** (`mandate_exceeded` / `mandate_expired` / `mandate_bad_signature`), optional `negotiate` tips, **no** Razorpay Order. Under remaining → **402**. |
| **Code** | `src/lib/checkout.ts` · `src/lib/negotiate.ts` · Drawers 403 card |
| **Verify** | Obsidian 27" on ₹8k → type **pay** → 403 + Fit the mandate actions. |
| **Pass if** | 403 path never creates a live Order; negotiate is same agent, not a second bot. |

### A5. Visible **audit trail**

| | |
| --- | --- |
| **Claim** | Append-only audit. Live AOV on `/audit` after real captures (seed only until first live row). |
| **Code** | `src/lib/audit.ts` · `src/app/api/audit/route.ts` · `src/app/audit/page.tsx` |
| **Verify** | Happy path + 403 + `/lab` forge; refresh `/audit`. |
| **Pass if** | Money path reconstructable; growth strip says live vs synthetic. |

### A6. Failure handled gracefully

| | |
| --- | --- |
| **Claim** | Decline stop rule; dismiss acknowledgment; expired mandate (lab); bad webhook HMAC rejected. |
| **Code** | `failCheckout` · dismiss modal handler · `/lab` expire + bad_webhook |
| **Verify** | Decline / close Checkout / lab expire. |
| **Pass if** | No retry storm; cart rules as documented. |

### Stand-out extras (not a second agent)

| Extra | Where |
| --- | --- |
| Separate sign vs verify keys | `mandate-signer` vs `mandate` |
| Gate lab | `/lab` |
| Same-agent 403 negotiate | quote `negotiate` + Drawers |
| Live growth | capture → `GrowthRow` source `live` |

### Every shopping website?

**No.** This app makes **Circuit** agent-transactable. Ubiquity = merchants adopt the adapter (or UAP/Razorpay rail), not scraping the open web.

---

## B. Official example directions (coverage)

### B1. Conversational in-app checkout

| | |
| --- | --- |
| **Claim** | Chat is the primary store: search, add, pay by typing **pay**. Razorpay opens from chat on 402. **Pay this cart** CTA lives on **Cart/bag only** (not chat chips). |
| **Code** | `ShopProvider.tsx`, `Drawers.tsx` Ask vs Cart sections, `StoreHeader.tsx` |
| **Verify** | Chat has no Pay chip; Cart has **Pay this cart** which sends `pay` to the agent. Typing **pay** in Ask still works. |

### B2. Agent-readable catalog

| | |
| --- | --- |
| **Claim** | Structured catalog feed (~62 Kreo SKUs, INR paise, categories, upsellSku). `GET /api/catalog` and `?q=` search. Agent tools only see this feed. |
| **Code** | `src/lib/catalog.ts` · `src/app/api/catalog/route.ts` · `/catalog` page |
| **Verify** | `curl localhost:3000/api/catalog` returns products with `sku`, `pricePaise`, etc. Search tool returns subset. |

### B3. Upsell & cross-sell agent

| | |
| --- | --- |
| **Claim** | After search/add, proposes upgrade/pairs **only if** they fit remaining mandate; otherwise refuses and audits. |
| **Code** | `src/lib/recommend.ts` · chat cards in `Drawers.tsx` |
| **Verify** | Add keyboard → mousepad/mouse suggestion when room left; near-cap cart → refuse path in audit. |

### B4. Campaign orchestrator

| | |
| --- | --- |
| **Claim** | Seeded **TKL week 10%** on `keyboard` category with budget. Applied in `priceCart` before gate. UI `/campaigns` + `GET /api/campaigns`. Spend recorded on capture. |
| **Code** | `src/lib/campaigns.ts` · seed in `src/lib/store.ts` · `src/app/campaigns/page.tsx` |
| **Verify** | Keyboard in cart → discount in breakdown / `campaignExplain`. Exhaust budget path returns skip explanation. |

### B5. Growth / revenue signal

| | |
| --- | --- |
| **Claim** | `/audit` shows AOV with vs without upsell. Prefers **live** captures; seed only until first live row. |
| **Code** | `recordLiveGrowth` in `checkout.ts` · `seedGrowth` labeled `source: seed` · audit API |
| **Honest note** | Seed is synthetic baseline. After real pays, strip says “From N real checkouts.” |

---

## C. Razorpay test-mode integration checklist

| Requirement | Implementation | Verify |
| --- | --- | --- |
| Test-mode keys only | `hasLiveTestKeys()` requires `rzp_test_` | Env Key ID prefix |
| Create Order | `createRazorpayOrder` in `razorpay.ts` from `quoteCheckout` | Dashboard Order amount = payable paise |
| Checkout UI | Razorpay.js in `ShopProvider.openRazorpayForQuote` | Modal opens with `order_id` |
| Signature verify | `verifyPaymentSignature` on confirm | Tampered signature → 400 when live keys |
| Fetch payment | `fetchPayment` before marking paid | Failed status → fail path |
| Confirm API | `POST /api/checkout/confirm` | Returns paid record |
| Webhooks | `POST /api/webhooks/razorpay` — signature via `RAZORPAY_WEBHOOK_SECRET`; handles `payment.captured` / `payment.failed` | Tunnel URL in dashboard; audit shows webhook event |
| Mock without keys | `order_mock_*` / simulate success-decline in UI | Demo still shows 402 shape |

**Out of scope (by design):** refunds, live mode `rzp_live_`, agent entering PAN/CVV.

---

## D. Money rules (invariant table)

Verifier: these must hold in code review.

| Rule | Enforced in | Expected behavior |
| --- | --- | --- |
| LLM never sets Order amount | `quote_checkout` → `priceCart` only | Tool has no amount parameter |
| Mandate check before Order | `quoteCheckout` early return 403 | No `orders.create` on block |
| Campaign before gate | `priceCart` → then `explainMoney` | Payable = subtotal − discount |
| Idempotent paid confirm | `confirmCheckout` status `paid` | Second confirm `idempotent: true` |
| Failed checkout not reusable | status `failed` → 409 | Stop rule |
| Decline: cart intact | `failCheckout` does not clear cart | Human can edit bag |
| Mandate remaining on success | subtract `amountPaise`, buyer authority re-signs | Next gate uses new remaining |
| Audit on money events | `writeAudit` with three flags | `/audit` reflects |

---

## E. UX / product behaviors (current)

| Behavior | Where | Notes |
| --- | --- | --- |
| Ask opens by default | `ShopProvider` `askOpen: true` | Chat-first demo |
| Type **pay** to settle | Agent prompt + `quote_checkout` | Do not tell user to click a human-only Checkout that prices alone |
| **Pay this cart** only on bag | Cart drawer button → `send("pay")` | Removed from chat footer chips |
| Post-pay chat summary | Success handler in `ShopProvider` | Order done + amount + order/payment/checkout IDs + cart cleared |
| Mandate exceeded notice | Short notice + 403 card | Remaining vs cart explained |
| Human card confirm | Razorpay iframe only | Agent cannot PCI |

---

## F. Submission artifacts (Buildathon process)

Official submit pack (not all are code):

| Artifact | Repo status |
| --- | --- |
| Public GitHub repo | Ensure remote is public before submit |
| Architecture write-up | `ARCHITECTURE.md` (+ this file) |
| 5-minute pitch | Script in `PITCH.md` — video is external |
| Working demo on test APIs | Requires `rzp_test_` keys + recorded happy path |
| Failure story | Decline / stop rule (A6) — call out in pitch |

---

## G. Suggested verifier smoke script (ordered)

1. **Catalog** — `GET /api/catalog` → ≥1 product with `pricePaise`.
2. **Chat search** — natural language → product cards.
3. **Add + upsell** — add SKU → optional upsell within mandate → audit `upsell.proposed` or `upsell.refused`.
4. **Campaign** — keyboard line shows TKL discount in priced breakdown when campaign live.
5. **402 happy** — type **pay** under remaining → 402 → Razorpay → success → chat IDs + audit `payment.captured` + dashboard match.
6. **403 gate** — over remaining → 403, audit `checkout.blocked`, **no** new dashboard Order.
7. **Decline** — failure path → `payment.failed`, cart kept, no retry on same checkout.
8. **Pay CTA placement** — Pay chip absent in Ask; present in Cart.
9. **Audit growth strip** — `/audit` shows three AOV stats (seeded).
10. **Webhook** (if tunnel) — capture/fail events land in audit with valid signature.

---

## H. Known limitations (do not fail wrongly)

- **Document store by design** (`src/lib/store.ts` → `runtime.json` / `DATA_DIR`) — one JSON document for shoppers, carts, mandates, audit, campaigns. **Not a gap vs competitors:** the hard Track 01 bar is explainable / bounded / gated money + MCP + Razorpay 402, which this repo ships. The same document is what you insert into MongoDB; swapping the adapter is trivial and was intentionally deferred so the pitch stays on the rail, not CRUD infra. Do not fail for “no Mongo” if money paths + audit + MCP verify.
- **Mandate default ₹8,000** is a demo human cap; change in Cart or raise for demos. Remaining shrinks after pays — “full 8k” only on fresh session / raised max.
- **Growth AOV** prefers live captures; seed is baseline until the first paid checkout.
- **OpenAI optional** — without `OPENAI_API_KEY`, thin catalog fallback in `agent.ts`; prefer OpenAI for pitch quality.
- **Dev hydration warnings** on tiles can appear; not a money-path defect.
- **Webhook** needs public HTTPS URL; localhost alone will not receive Razorpay events.

---

## I. File map (quick)

```
src/lib/mandate-claims.ts   # canonical mandate bytes
src/lib/mandate-signer.ts   # buyer Ed25519 private key — sign only
src/lib/mandate.ts          # merchant public-key verify + gate
src/lib/negotiate.ts        # same-agent 403 counters
src/lib/quote.ts            # server pricing + explanation
src/lib/checkout.ts         # 402/403, confirm, fail, dismiss, live growth
src/lib/razorpay.ts         # Orders, signatures, fetch, webhook HMAC
src/lib/audit.ts            # append-only trail
src/lib/campaigns.ts        # orchestrator
src/lib/recommend.ts        # upsell/cross-sell bounded
src/lib/catalog.ts          # agent-readable catalog
src/lib/openai-agent.ts     # buyer agent tools (single agent)
src/app/lab/page.tsx        # adversarial + expiry demos
src/app/api/buyer/mandate/sign/route.ts
src/components/ShopProvider.tsx
src/components/Drawers.tsx
ARCHITECTURE.md · PITCH.md · README.md · TRACK01_VERIFICATION.md
```
---

## J. Verdict template (for verifying agent)

Copy and fill:

```
Track 01 — Circuit/u402

A1 E2E AI buyer + Razorpay test:     PASS / FAIL — notes:
A2 Explainable:                      PASS / FAIL — notes:
A3 Bounded (mandate):                PASS / FAIL — notes:
A4 Gated (403 before Order):         PASS / FAIL — notes:
A5 Audit trail visible:              PASS / FAIL — notes:
A6 Failure + stop rule:              PASS / FAIL — notes:

B1 Conversational checkout:          PASS / FAIL
B2 Agent-readable catalog:           PASS / FAIL
B3 Upsell/cross-sell bounded:        PASS / FAIL
B4 Campaign orchestrator:            PASS / FAIL
B5 Growth metrics honesty:           PASS (live preferred; seed until first capture) / FAIL

C Razorpay test integration:         PASS / FAIL — order_/pay_ matched dashboard: Y/N
D Sign≠verify keys + /lab forge:     PASS / FAIL
E Same-agent 403 negotiate:          PASS / FAIL

Blockers before submit:
-
```

**Overall Track 01 bar met only if A1–A6 all PASS** with at least one real test-mode `order_` / `pay_` captured in dashboard for the pitch recording.
