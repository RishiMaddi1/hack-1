"use client";

import { useRef, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatProductRow } from "@/components/ChatProductRow";
import { ChatText } from "@/components/ChatText";
import { EmailReminders } from "@/components/EmailReminders";
import { useShop } from "@/components/ShopProvider";
import { formatInr } from "@/lib/money";
import { getProduct } from "@/lib/catalog";
import { suggestionsForMessage } from "@/lib/chat-suggestions";
import type { ChatMessage, U402Quote } from "@/lib/types";

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

function PaidReceiptCard({
  receipt,
}: {
  receipt: NonNullable<ChatMessage["receipt"]>;
}) {
  const campaignBit =
    (receipt.discountPaise ?? 0) > 0 && receipt.campaignName
      ? `${receipt.campaignName} (−${formatInr(receipt.discountPaise!)})`
      : null;

  return (
    <div className="mt-3 rounded-lg border border-line bg-bg p-3 text-left text-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Paid · Captured</p>
      <p className="mt-1 font-[family-name:var(--font-serif)] text-xl">
        {formatInr(receipt.amountPaise)}
      </p>

      {receipt.lines.length ? (
        <ul className="mt-3 space-y-2">
          {receipt.lines.map((line) => {
            const image = getProduct(line.sku)?.image;
            return (
              <li key={line.sku} className="flex items-center gap-2.5">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-sm border border-line bg-bg object-cover"
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

      <div className="mt-3 space-y-1 border-t border-line pt-2 font-[family-name:var(--font-mono)] text-[10px] leading-relaxed text-muted">
        <p>Order {receipt.orderId}</p>
        <p>Payment {receipt.paymentId}</p>
        <p>Checkout {receipt.checkoutId}</p>
      </div>
      <p className="mt-2 text-xs text-muted">Cart cleared. Trail is on /audit.</p>
    </div>
  );
}

export function CartDrawer() {
  const pathname = usePathname();
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
    shopperToken,
    isSignedIn,
  } = useShop();
  if (pathname.startsWith("/pay")) return null;
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
            Circle limit). Default is ₹8,000 so a few mid-range items fit; a high-ticket SKU may not.
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
          {isSignedIn && shopperToken ? <EmailReminders shopperToken={shopperToken} /> : null}
          {notice ? <p className="mt-3 text-xs leading-relaxed text-accent">{notice}</p> : null}
        </div>
      </aside>
    </div>
  );
}

export function AskDrawer() {
  const pathname = usePathname();
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
    keysOn,
    openRazorpayForQuote,
    simulate,
    notice,
    priced,
  } = useShop();
  const scrollRef = useRef<HTMLDivElement>(null);
  const replyStartRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    if (!askOpen) return;
    const grew = messages.length > prevLen.current;
    prevLen.current = messages.length;
    if (grew && messages[messages.length - 1]?.role === "assistant") {
      replyStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (busy && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy, notice, askOpen]);

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

  if (pathname.startsWith("/pay")) return null;
  if (!askOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-fg/30">
      <button type="button" className="flex-1" aria-label="Close chat" onClick={() => setAskOpen(false)} />
      <aside className="flex h-full w-full flex-col bg-card shadow-xl sm:w-[min(100%,72vw)] sm:max-w-5xl">
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-serif)] text-2xl">Buyer agent</h2>
              <p className="text-xs text-muted">
                {llmOn
                  ? "Search, cart, offers, 402 quote — type pay when ready."
                  : "Keyword mode until an API key loads."}
              </p>
            </div>
            <button type="button" onClick={() => setAskOpen(false)} className="text-sm text-muted">
              Close
            </button>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {showGuide ? (
            <div className="border border-line bg-bg p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  How this agent works
                </p>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="text-[11px] text-muted hover:text-fg"
                >
                  Got it
                </button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1">
                {[
                  { n: "1", t: "Ask", prompt: "wireless mouse under 2000" },
                  { n: "2", t: "Offers", prompt: "any offers?" },
                  { n: "3", t: "Bag", prompt: "what's in my bag" },
                  { n: "4", t: "Pay", prompt: "pay" },
                ].map((s) => (
                  <button
                    key={s.n}
                    type="button"
                    disabled={busy}
                    onClick={() => void send(s.prompt)}
                    className="border border-line px-1.5 py-2 text-center hover:border-fg disabled:opacity-40"
                  >
                    <p className="font-mono text-[10px] text-muted">{s.n}</p>
                    <p className="mt-0.5 text-[11px] font-medium">{s.t}</p>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm leading-snug text-muted">
                Tap a step to run it. Grid “Add to bag” still works — this panel is the chat path.
              </p>
            </div>
          ) : null}

          {priced?.lines.length ? (
            <p className="text-[11px] text-muted">
              Bag:{" "}
              {priced.lines
                .map((l) => `${l.qty}× ${l.name.split(" ").slice(0, 3).join(" ")}`)
                .join(" · ")}{" "}
              · {formatInr(priced.payablePaise)}
            </p>
          ) : null}

          {messages.map((m, idx) => {
            const isLastAssistant = m.role === "assistant" && idx === messages.length - 1;
            return (
              <div
                key={m.id}
                ref={isLastAssistant ? replyStartRef : undefined}
                className={m.role === "user" ? "text-right" : ""}
              >
                {m.receipt && (!m.text || m.text === "Paid.") ? null : (
                  <ChatText text={m.text} incoming={m.role === "user"} />
                )}
                {m.offerNote ? (
                  <p className="mt-2 text-left text-xs text-accent">{m.offerNote}</p>
                ) : null}
                {m.products?.length ? (
                  <div className="mt-3 text-left">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {m.showCart ? "In your bag" : "Matches"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {m.products.map((p) => (
                        <ChatProductRow
                          key={p.sku}
                          product={p}
                          onAdd={(sku) => void addSku(sku, true)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {m.upsell ? (
                  <div className="mt-4 text-left">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {(() => {
                        const upCat = getProduct(m.upsell!.sku)?.category;
                        const matchCat = m.products?.[0]
                          ? getProduct(m.products[0].sku)?.category
                          : upCat;
                        return upCat && matchCat && upCat === matchCat
                          ? "A step up — costlier in this lane"
                          : "Top of this lane — different category instead";
                      })()}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <ChatProductRow
                        product={m.upsell}
                        badge={
                          getProduct(m.upsell.sku)?.category ===
                          (m.products?.[0] ? getProduct(m.products[0].sku)?.category : undefined)
                            ? "Upgrade"
                            : "Also"
                        }
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
                    <div className="grid grid-cols-2 gap-2">
                      {m.crossSell.map((p) => (
                        <ChatProductRow
                          key={p.sku}
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
                    onNegotiate={(action, sku, replaceSku) =>
                      void applyNegotiate(action, sku, replaceSku)
                    }
                  />
                ) : null}
                {m.receipt ? <PaidReceiptCard receipt={m.receipt} /> : null}
              </div>
            );
          })}
          {busy ? <p className="text-sm text-muted">Working the tools…</p> : null}
          {notice ? <p className="text-xs leading-relaxed text-accent">{notice}</p> : null}
        </div>

        <div className="border-t border-line">
          {(() => {
            if (busy) return null;
            const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
            const chips = lastAssistant
              ? suggestionsForMessage(lastAssistant, {
                  cartHasItems: Boolean(priced?.lines?.length),
                })
              : [];
            if (!chips.length) return null;
            return (
              <div className="flex flex-wrap gap-2 px-4 pt-3">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={busy}
                    onClick={() => void send(chip)}
                    className="border border-line bg-bg px-2.5 py-1 text-left text-[11px] text-fg hover:border-fg disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            );
          })()}
          <form
            className="flex gap-2 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask, add, offers, or type pay"
              className="flex-1 border border-line bg-card px-3 py-2 text-sm outline-none focus:border-fg"
            />
            <button type="submit" disabled={busy} className="bg-fg px-4 py-2 text-sm text-bg disabled:opacity-50">
              Send
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}

