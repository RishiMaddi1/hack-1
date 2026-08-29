# u402 — Circuit

Razorpay AI Buildathon · Track 01 · AI Growth & Agentic Commerce

**Mandate-gated agentic checkout** for an Indian merchant on **Razorpay test mode**. One buyer agent searches, adds, and triggers pay. The server prices the cart, verifies a **buyer-signed** spend mandate (Ed25519), and only then creates a Razorpay Order (HTTP 402). Human confirms the card. Every rupee is on `/audit`.

Not a second agent. Not “works on every website.” Protocol-**shaped** adapter (catalog + mandate + 402 quote) merchants could implement.

## Run

```bash
cp .env.example .env.local
# paste rzp_test_ Key ID + Key Secret (+ optional OpenAI + mandate keypair)
npm install
npm run dev
```

Open [http://localhost:3000/shop](http://localhost:3000/shop).

- Gate lab (forge / expire / bad webhook): [/lab](http://localhost:3000/lab)
- Audit + live AOV: [/audit](http://localhost:3000/audit)

Until keys are in `.env.local`, checkout still quotes a 402 and you can simulate success/decline. After keys are in, typing **pay** opens Razorpay Checkout. The `order_…` / `pay_…` IDs must match the Test Mode dashboard.

Generate a fresh mandate keypair (optional; demo keys ship in code):

```bash
node scripts/gen-mandate-keys.mjs
```

### Test cards (Razorpay)

- Success: `4111 1111 1111 1111` · any future expiry · any CVV
- Failure (graceful stop demo): use a [failure method](https://razorpay.com/docs/payments/payments/test-card-upi-details/) from the docs, then watch `/audit`

Webhook URL when you have a tunnel: `https://<host>/api/webhooks/razorpay`  
Events: `payment.captured`, `payment.failed`

## Demo script

1. Shop: *Swarm keyboard and Harpy mouse under ₹5000*
2. Add via agent or tile; accept a bounded upsell if it fits
3. Type **pay** → 402 → Razorpay test pay → chat shows order/payment IDs
4. Over-mandate: Obsidian 27" on ₹8,000 cap → **403**, negotiate tips, **no** Order
5. Decline or dismiss → stop / cart intact
6. `/lab` forge remaining → signature fail
7. `/audit` live AOV after real captures

The ₹8,000 default is a **demo human cap**. Track 01 requires money actions bounded and gated — not a Razorpay API limit.

## Stack

Next.js · TypeScript · Razorpay Node SDK · Ed25519 mandates · file-backed audit log

See [ARCHITECTURE.md](ARCHITECTURE.md), [PITCH.md](PITCH.md), [TRACK01_VERIFICATION.md](TRACK01_VERIFICATION.md).
