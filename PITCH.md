# 5-minute pitch

0:00 Problem. Agents cannot buy from a normal Indian merchant. Protocols are US/crypto. UAP is not live.

0:40 Happy path. Split: “filter coffee for 4 under ₹400” → cards → add → jaggery upsell → 402 → Razorpay test pay → dashboard ticks.

1:40 Inspector. Mandate JSON, 402 body, `order_…`, `pay_…`. Every rupee explained.

2:30 Decline. Test failure card. Agent stops. Audit `payment.failed`. Cart not duplicated.

3:20 Gate. “Add the blender.” 403 `MANDATE_EXCEEDED`. No Order.

4:10 Batch AOV lift on `/audit`. One architecture diagram.

4:50 Ask. This is the intern who already built the Razorpay-shaped adapter.
