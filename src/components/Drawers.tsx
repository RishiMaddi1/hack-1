"use client";

import { useRef, useEffect } from "react";
import { ProductCard } from "@/components/ProductCard";
import { ChatText } from "@/components/ChatText";
import { useShop } from "@/components/ShopProvider";
import { formatInr } from "@/lib/money";
import { getProduct } from "@/lib/catalog";
import type { U402Quote } from "@/lib/types";

function QuoteCard({
  quote,
  keysOn,
  onPayAgain,
  onSimulate,
  onNegotiate,
}: {
  quote: U402Quote;
  keysOn: boolean;
  onPayAgain: () => void;
  onSimulate: (ok: boolean) => void;
  onNegotiate?: (action: "remove_sku" | "swap_to", sku: string, replaceSku?: string) => void;
}) {
  const accept = quote.accepts[0];
  const blocked =
    quote.error === "mandate_exceeded" ||
    quote.error === "mandate_expired" ||
    quote.error === "mandate_bad_signature";
  const title =
    quote.error === "mandate_expired"
      ? "403 · Mandate expired"
      : quote.error === "mandate_bad_signature"
        ? "403 · Bad mandate signature"
        : quote.error === "mandate_exceeded"
          ? "403 · Mandate exceeded"
          : "HTTP 402 · Payment required";

  const gateLine = blocked
    ? quote.error === "mandate_expired"
      ? "Mandate expired — re-authorise a spend cap in Cart. No Razorpay Order."
      : quote.error === "mandate_bad_signature"
        ? "Mandate signature failed. No Razorpay Order."
        : `Cart is ${formatInr(quote.breakdown.payablePaise)} but only ${formatInr(quote.mandate.remainingPaise)} left. No Razorpay Order.`
    : "Order quoted — confirm the card on Razorpay.";

  const campaignBit =
    quote.breakdown.discountPaise > 0 && quote.breakdown.campaignName
      ? `${quote.breakdown.campaignName} (−${formatInr(quote.breakdown.discountPaise)})`
      : null;

  return (
    <div
      className={`mt-3 rounded-lg border p-3 text-left text-sm ${
        blocked ? "border-danger/40 bg-danger/5" : "border-line bg-bg"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-1 font-[family-name:var(--font-serif)] text-xl">
        {formatInr(quote.breakdown.payablePaise)}
      </p>

      {quote.breakdown.lines.length ? (
        <ul className="mt-3 space-y-2">
          {quote.breakdown.lines.map((line) => {
            const image = getProduct(line.sku)?.image;
            return (
              <li key={line.sku} className="flex items-center gap-2.5">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-sm border border-line object-cover bg-bg"
                  />
                ) : (
                  <span className="h-9 w-9 shrink-0 rounded-sm border border-line bg-bg" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium leading-snug text-fg">
                    {line.qty > 1 ? `${line.qty}× ` : ""}
                    {line.name}
                  </p>
                  <p className="text-[10px] text-muted">{formatInr(line.linePaise)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {campaignBit ? <p className="mt-2 text-[10px] text-muted">{campaignBit}</p> : null}
      <p className="mt-2 text-xs leading-relaxed text-muted">{gateLine}</p>
      {accept ? (
        <p className="mt-2 font-[family-name:var(--font-mono)] text-[10px] text-muted">
          {accept.orderId} · {accept.checkoutId}
        </p>
      ) : null}
      <p className="mt-1 text-[10px] text-muted">
        Mandate {formatInr(quote.mandate.remainingPaise)} left of {formatInr(quote.mandate.maxPaise)}
      </p>
      {blocked && quote.negotiate?.length && onNegotiate ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Fit the mandate</p>
          {quote.negotiate.map((n) => (
            <button
              key={`${n.action}-${n.sku}`}
              type="button"
              onClick={() => onNegotiate(n.action, n.sku, n.replaceSku)}
              className="block w-full border border-line px-3 py-2 text-left text-xs hover:border-fg"
            >
              {n.note}
            </button>
          ))}
        </div>
      ) : null}
      {!blocked && accept ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPayAgain}
            className="bg-fg px-3 py-1.5 text-xs text-bg"
          >
            Open Razorpay
          </button>
          {!keysOn ? (
            <>
              <button
                type="button"
                onClick={() => onSimulate(true)}
                className="border border-line px-3 py-1.5 text-xs"
              >
                Simulate success
              </button>
              <button
                type="button"
                onClick={() => onSimulate(false)}
                className="border border-danger/40 px-3 py-1.5 text-xs text-danger"
              >
                Simulate decline
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CartDrawer() {
  const {
    cartOpen,
    setCartOpen,
    setAskOpen,
    priced,
    mandate,
    setQty,
    setCap,
    notice,
    send,
  } = useShop();
  if (!cartOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-fg/30">
      <button type="button" className="flex-1" aria-label="Close cart" onClick={() => setCartOpen(false)} />
      <aside className="flex h-full w-full max-w-md flex-col bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-[family-name:var(--font-serif)] text-2xl">Agent cart</h2>
            <p className="text-xs text-muted">Inspect only. Pay happens in chat.</p>
          </div>
          <button type="button" onClick={() => setCartOpen(false)} className="text-sm text-muted">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!priced?.lines.length ? (
            <p className="text-sm text-muted">Nothing in the cart yet. Talk to the buyer agent.</p>
          ) : (
            <ul className="space-y-4">
              {priced.lines.map((line) => (
                <li key={line.sku} className="flex justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{line.name}</p>
                    <p className="text-muted">{formatInr(line.unitPaise)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void setQty(line.sku, line.qty - 1)}>
                      −
                    </button>
                    <span>{line.qty}</span>
                    <button type="button" onClick={() => void setQty(line.sku, line.qty + 1)}>
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-line px-5 py-4 text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span>{formatInr(priced?.subtotalPaise ?? 0)}</span>
          </div>
          <div className="mt-1 flex justify-between text-muted">
            <span>{priced?.campaignName || "Offer"}</span>
            <span>−{formatInr(priced?.discountPaise ?? 0)}</span>
          </div>
          <div className="mt-2 flex justify-between font-medium">
            <span>Quoted total</span>
            <span>{formatInr(priced?.payablePaise ?? 0)}</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            You set this spend mandate — not Razorpay. The agent cannot create an Order above it (same idea as a UPI
            Circle limit). Default is ₹8,000 so a keyboard and mouse fit; a monitor does not.
          </p>
          <div className="mt-2 flex gap-2">
            {[
              { label: "₹2,000", paise: 200000 },
              { label: "₹8,000", paise: 800000 },
              { label: "₹25,000", paise: 2500000 },
            ].map((opt) => (
              <button
                key={opt.paise}
                type="button"
                onClick={() => void setCap(opt.paise)}
                className={`flex-1 border py-1.5 text-xs ${
                  mandate?.maxPaise === opt.paise ? "border-fg bg-fg text-bg" : "border-line"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {mandate
              ? (priced?.payablePaise ?? 0) > mandate.remainingPaise
                ? `This cart is ${formatInr(priced?.payablePaise ?? 0)} against ${formatInr(mandate.remainingPaise)} left. The agent will get 403 — no Order.`
                : `${formatInr(mandate.remainingPaise - (priced?.payablePaise ?? 0))} left on your ${formatInr(mandate.maxPaise)} mandate after this cart.`
              : null}
          </p>
          <button
            type="button"
            disabled={!priced?.lines.length}
            onClick={() => {
              setCartOpen(false);
              setAskOpen(true);
              void send("pay");
            }}
            className="mt-4 w-full border border-fg py-3 text-fg disabled:opacity-40"
          >
            Pay this cart
          </button>
          {notice ? <p className="mt-3 text-xs leading-relaxed text-accent">{notice}</p> : null}
        </div>
      </aside>
    </div>
  );
}

export function AskDrawer() {
  const {
    askOpen,
    setAskOpen,
    messages,
    text,
    setText,
    send,
    busy,
    addSku,
    setQty,
    llmOn,
    quote,
    keysOn,
    openRazorpayForQuote,
    simulate,
    notice,
  } = useShop();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, quote, notice]);

  async function applyNegotiate(
    action: "remove_sku" | "swap_to",
    sku: string,
    replaceSku?: string,
  ) {
    if (action === "remove_sku") {
      await setQty(sku, 0);
    } else {
      if (replaceSku) await setQty(replaceSku, 0);
      await addSku(sku, true);
    }
  }

  if (!askOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-fg/30">
      <button type="button" className="flex-1" aria-label="Close chat" onClick={() => setAskOpen(false)} />
      <aside className="flex h-full w-full max-w-lg flex-col bg-card shadow-xl">
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-serif)] text-2xl">Buyer agent</h2>
              <p className="text-xs text-muted">
                {llmOn
                  ? "Search, cart, 402 quote, Razorpay — type pay when ready."
                  : "Keyword mode until an API key loads."}
              </p>
            </div>
            <button type="button" onClick={() => setAskOpen(false)} className="text-sm text-muted">
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
              <ChatText text={m.text} incoming={m.role === "user"} />
              {m.products?.length ? (
                <div className="mt-3 text-left">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Matches</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {m.products.map((p) => (
                      <ProductCard key={p.sku} compact product={p} onAdd={(sku) => void addSku(sku, true)} />
                    ))}
                  </div>
                </div>
              ) : null}
              {m.upsell ? (
                <div className="mt-4 text-left">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                    A step up — still inside your cap
                  </p>
                  <div className="max-w-xs">
                    <ProductCard
                      compact
                      product={m.upsell}
                      badge="Upgrade"
                      onAdd={(sku) => void addSku(sku, true)}
                    />
                  </div>
                </div>
              ) : null}
              {m.crossSell?.length ? (
                <div className="mt-4 text-left">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                    Often bought together
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {m.crossSell.map((p) => (
                      <ProductCard
                        key={p.sku}
                        compact
                        product={p}
                        badge="Pair"
                        onAdd={(sku) => void addSku(sku, true)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              {m.quote ? (
                <QuoteCard
                  quote={m.quote}
                  keysOn={keysOn}
                  onPayAgain={() => void openRazorpayForQuote(m.quote!)}
                  onSimulate={(ok) => void simulate(ok)}
                  onNegotiate={(action, sku, replaceSku) => void applyNegotiate(action, sku, replaceSku)}
                />
              ) : null}
            </div>
          ))}
          {busy ? <p className="text-sm text-muted">Working the tools…</p> : null}
          {notice ? <p className="text-xs leading-relaxed text-accent">{notice}</p> : null}
          <div ref={bottom} />
        </div>
        <form
          className="flex gap-2 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type pay when the cart is ready"
            className="flex-1 border border-line bg-card px-3 py-2 text-sm outline-none focus:border-fg"
          />
          <button type="submit" disabled={busy} className="bg-fg px-4 py-2 text-sm text-bg disabled:opacity-50">
            Send
          </button>
        </form>
      </aside>
    </div>
  );
}
