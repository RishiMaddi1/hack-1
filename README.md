# u402 — Mandi Coffee

Razorpay AI Buildathon · Track 01 · AI Growth & Agentic Commerce

HTTP 402 for Indian merchants. A buyer talks to the shop (or clicks Add to cart). Settlement is **Razorpay test-mode Orders/Payments**. Spend is gated by a UAP-shaped mandate. Every rupee is on the audit trail.

## Run

```bash
cp .env.example .env.local
# paste rzp_test_ Key ID + Key Secret
npm install
npm run dev
```

Open [http://localhost:3000/shop](http://localhost:3000/shop).

Until keys are in `.env.local`, checkout still quotes a 402 and you can simulate success/decline. After keys are in, the same button opens Razorpay Checkout. The `order_…` / `pay_…` IDs must match the Test Mode dashboard.

### Test cards (Razorpay)

- Success: `4111 1111 1111 1111` · any future expiry · any CVV
- Failure (graceful stop demo): use a [failure method](https://razorpay.com/docs/payments/payments/test-card-upi-details/) from the docs, then watch `/audit`

Webhook URL when you have a tunnel: `https://<host>/api/webhooks/razorpay`  
Events: `payment.captured`, `payment.failed`

## Demo script

1. Shop: *filter coffee for 4 under ₹400*
2. Click **Add to cart** or say *add the 250g pack*
3. Accept the jaggery upsell if it still fits the ₹500 mandate
4. Checkout → Razorpay test pay
5. Try *add the blender* → mandate gate, no Order created
6. Decline a payment → stop rule, cart not duplicated
7. `/catalog` `/campaigns` `/audit`

## Stack

Next.js · TypeScript · Razorpay Node SDK · file-backed audit log
