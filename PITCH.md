# 5-minute pitch — Circuit · Track 01

**Before record:** `/shop` logged in, budget set, cart empty · `/lab` ready · `/audit` · architecture image ready · face for open/close.

Official bar: **explainable · bounded · gated** · **audit trail** · **one failure handled gracefully**.

---

## 0:00–0:40 · Open (face → homepage)

**Screen:** Homepage. Architecture image only at the end.

**Structure:** who you are → problem → what you built → why it's thin → what's next in the video.

**Say:**
> Hi — I'm Rishi. Track 01, AI Growth and Agentic Commerce.
>
> So the idea Razorpay is pushing is pretty clear: AI shouldn't just suggest stuff. It should actually buy it for you. Cool. Except right now? An agent still can't safely check out at a normal Indian store. A lot of the protocols you hear about are US or crypto. UAP isn't live. So somebody has to build a rail that merchants here can actually use.
>
> That's what I built. Circuit is just the example shop — the reference store — so you can see the rail working end to end. You set a signed budget. The server prices the cart, not the AI. You pay on Razorpay. And if you're an AI buyer, you hit the same path over MCP. Same gate for the chat UI and for agents.
>
> And we kept the standard thin on purpose. Agents can already look up products by name and SKU. You don't need RAG or a whole ML stack just to make a merchant AI-buyable. Yeah, at Razorpay scale compute isn't free — but that cost should live on the platform once. Not get rebuilt inside every merchant app. Merchants just adopt a small contract: signed budget, server-priced cart, MCP discovery, 402 into Razorpay. Fancy ranking and models? Platform can add that later. First you need something people can actually ship.
>
> Okay — I'll show you the live demo. At the end I'll throw up the architecture so you can see how it all fits.

**YC Startup School?** Skip in this video.

---

## 0:35–1:20 · Success path (screen: `/shop`)

**Do:** Ask something like *“find me a Swarm keyboard under 4k”* → Add → Pay → let Razorpay open (or freeze on Payment Link if slow).

**Say:**

> Shopper picks a username, sets a budget first — that budget is a signed mandate. Until that's done, cart and checkout stay locked.
>
> I talk to the agent in normal English. It searches the live catalog, shows real product images, adds to cart.
>
> When I hit pay — watch this amount. The AI never decides what Razorpay charges. The server looks up the SKUs and prices the cart itself. API keys never leave the server. I confirm on Razorpay like a normal customer.
>
> That's the happy path: explainable, bounded, gated.

---

## 1:20–1:40 · Growth extras (same screen, quick)

**Say:**

> And it's not just pay. Same agent can upsell and cross-sell. Campaigns are built in. If someone leaves a cart, Audit can email them a reminder — I'll show that in a minute. So this grows revenue and makes the merchant AI-buyable in one product.

---

## 1:40–2:10 · MCP (homepage images or Claude)

**Say:**

> Same flow works headless. Any MCP client — Claude Desktop, whatever — gets the same tools: register, set budget, search, add, quote checkout. Quote comes back with a Payment Link for the human.
>
> Discovery lives at `/.well-known/agent-commerce.json`. Important bit: UI and MCP are not two code paths. One cart, one mandate, one checkout. And none of this is hardcoded for Circuit alone — any Razorpay builder merchant can adopt the same shape.

---

## 2:10–2:55 · Lab — one deep demo + the rest in one-liners (screen: `/lab`)

**Hero attack: Underpay** (most impressive — proves the AI can't invent the price).

**Do:** Click **Underpay injection**. Let the terminal / evidence show BLOCK / real cart amount.

**Say:**

> Track asks every money action to be gated. We don't put stickers on the UI — we attack our own gate live.
>
> This one is underpay. The attacker asks checkout for one rupee while the cart is hundreds. Watch the log — we still quote the real cart total. The agent cannot pass a fake amount. Catalog prices win.
>
> Quick tour of the others, same idea:
>
> - **Forge remaining** — rewrite the budget; signature fails, blocked.
> - **Replay stale mandate** — old signature; rejected.
> - **Expire mandate** — past expiry; blocked.
> - **Bad webhook HMAC** — wrong secret; ignored.
> - **Double capture** — two capture attempts; money moves once.
>
> Fail-closed everywhere. Keys never in the model.

---

## 2:55–3:25 · Fail a payment (screen: `/shop`)

**Do:** Start checkout again (or reuse cart) → decline / close Razorpay / fail with test card.

**Say:**

> One failure, handled cleanly. Payment fails or I dismiss checkout — cart stays, no retry storm, stop rule kicks in. That's the graceful failure the track asks for.

---

## 3:25–4:10 · Audit + email (screen: `/audit`)

**Prep:** Fail/dismiss payment first so this session shows under **Left carts**. Shopper must have verified email. Prefer a costlier cart item so Bill 2 appears in the email.

### 1) Land on the page

**Show:** `/audit` — title, hash chain line, AOV stats if visible.

**Say:**
> Merchant audit. This is the trail Track asks for — every money step, explainable, bounded, gated.
>
> Up top — hash chain OK. Events are linked with SHA-256, so if someone tampers with the log, it breaks. That's not a screenshot of a badge. That's a real chain.
>
> These numbers here? Average order with and without upsell — so you can see growth, not just checkout.

### 2) Tabs

**Do:** Briefly point at tabs: Adds · Paid · Failed · Open quotes · Left carts.

**Say:**
> Adds, paid, failed, open quotes, left carts — click a row, you get that session's full log. Merchant view only. Agents can't see other people's carts.

### 3) Left cart + send email

**Do:**
1. Click **Left carts**
2. Click the session you just abandoned
3. Point at the live cart / session panel on the right
4. Click **Send reminder email** (use Send again / force if already sent)
5. If you can, cut to inbox for 2 seconds

**Say:**
> This left cart is the one I just failed on purpose. Cart's still here. Shopper already verified email.
>
> I hit send reminder… and they get a receipt-style mail — Bill 1 is the exact bag they left, with a pay link. If there's a cheaper same-category option, Bill 2 shows that too. Merchant recovery without leaving this console.

### 4) Optional — close the loop

**Do:** Open the pay link from the email (or pay in shop) if you have time.

**Say:**
> And they can finish payment from that link. Full loop — abandon, remind, recover.

### 5) Bridge out

**Say:**
> Okay — that's audit. Last thing — I'll throw up the architecture so you can see how the whole rail fits together.


---

## 4:10–4:40 · Architecture image + close (short)

**Screen:** Fullscreen `assets/circuit-u402-architecture.png` ~8–10s, then end card.

**Say (over the image — keep it short):**

> This is how it works — Azure, identity and signed budget, merchant gate, u402 into Razorpay, hash-chained audit, lab on the side. Circuit is the example shop. One money path for chat and MCP. Live on Azure.
>
> If builder ships this contract, every merchant on it becomes AI-transactable.
>
> Don't hire another chat widget. Hire the person who built the rail.

**End card:** repo URL · your name · Track 01.

---

## Timing cheat


| Time | Screen     | Beat                                                |
| ---- | ---------- | --------------------------------------------------- |
| 0:00 | Face       | Who → problem → rail/Circuit → thin standard → demo |
| 0:35 | Shop       | Success buy                                         |
| 1:20 | Shop       | Upsell / growth one breath                          |
| 1:40 | MCP        | Same tools, Payment Link                            |
| 2:10 | Lab        | **Underpay** deep · others one line                 |
| 2:55 | Shop       | Fail payment                                        |
| 3:25 | Audit      | Chain + send reminder email (+ optional pay)        |
| 4:10 | Arch image | “This is how it works” · hire ask                   |


## Don't say

Competitor names · “thin adapter” jargon without explaining · “hardcoded” · long protocol alphabet soup · “compute is free” / “ML is useless” · “cheap for merchants” as if Razorpay has no cost (cost sits on the **platform once**; merchant adopts a small contract) · dunking on Vercel for more than one breath · repeating the long thesis again over the architecture slide