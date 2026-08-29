"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import { formatInr } from "@/lib/money";
import type { ChatMessage, Mandate, U402Quote } from "@/lib/types";
import { getProduct } from "@/lib/catalog";

type Priced = {
  lines: Array<{ sku: string; name: string; qty: number; unitPaise: number; linePaise: number }>;
  subtotalPaise: number;
  discountPaise: number;
  payablePaise: number;
  campaignName?: string;
};

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (response: { error?: { description?: string } }) => void) => void;
    };
  }
}

function sessionId() {
  const key = "u402_session";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `ses_${crypto.randomUUID().slice(0, 12)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function ShopApp() {
  const [sid, setSid] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "hello",
      role: "assistant",
      text: "Mandi is open. Ask like a shop — “filter coffee for 4 under ₹400” — or add from the cards I find. Checkout is Razorpay test mode, gated by your ₹500 mandate.",
    },
  ]);
  const [priced, setPriced] = useState<Priced | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [quote, setQuote] = useState<U402Quote | null>(null);
  const [keysOn, setKeysOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`/api/cart?sessionId=${id}`);
    const data = (await res.json()) as { priced: Priced; mandate: Mandate };
    setPriced(data.priced);
    setMandate(data.mandate);
  }, []);

  useEffect(() => {
    const id = sessionId();
    setSid(id);
    void refresh(id);
    void fetch("/api/status")
      .then((r) => r.json())
      .then((s: { razorpayTest: boolean }) => setKeysOn(s.razorpayTest));
  }, [refresh]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function addSku(sku: string) {
    if (!sid) return;
    await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, action: "add", sku, qty: 1 }),
    });
    const product = getProduct(sku);
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: `Added ${product?.name ?? sku} from the card.`,
        products: product
          ? [
              {
                sku: product.sku,
                name: product.name,
                short: product.short,
                details: product.details,
                pricePaise: product.pricePaise,
                image: product.image,
              },
            ]
          : undefined,
      },
    ]);
    await refresh(sid);
  }

  async function setQty(sku: string, qty: number) {
    await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, action: "set", sku, qty }),
    });
    await refresh(sid);
  }

  async function send(message?: string) {
    const payload = (message ?? text).trim();
    if (!payload || !sid) return;
    setText("");
    setBusy(true);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: payload }]);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, text: payload }),
    });
    const data = (await res.json()) as { message: ChatMessage };
    setMessages((m) => [...m, data.message]);
    if (data.message.quote) setQuote(data.message.quote);
    await refresh(sid);
    setBusy(false);
  }

  async function startCheckout() {
    if (!sid) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid }),
    });
    const body = (await res.json()) as U402Quote & { error?: string };
    setQuote(body.u402Version ? body : null);
    if (res.status === 403) {
      setNotice(body.breakdown?.explanation || "Mandate blocked this checkout. No Razorpay Order was created.");
      setBusy(false);
      return;
    }
    if (res.status !== 402) {
      setNotice(body.error || "Could not quote checkout.");
      setBusy(false);
      return;
    }
    const accept = body.accepts[0];
    if (!accept) {
      setBusy(false);
      return;
    }
    if (!keysOn || accept.network === "razorpay_mock") {
      setNotice("Razorpay test keys not in .env yet. Use Simulate success or Simulate decline below.");
      setBusy(false);
      return;
    }
    openRazorpay(accept, body);
    setBusy(false);
  }

  function openRazorpay(accept: U402Quote["accepts"][number], body: U402Quote) {
    if (!window.Razorpay) {
      setNotice("Razorpay Checkout script still loading. Try again in a second.");
      return;
    }
    const rzp = new window.Razorpay({
      key: accept.keyId,
      amount: accept.amountPaise,
      currency: "INR",
      order_id: accept.orderId,
      name: "Mandi Coffee",
      description: body.breakdown.explanation.slice(0, 120),
      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            checkoutId: accept.checkoutId,
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          }),
        });
        setNotice(`Paid. Payment ${response.razorpay_payment_id} on ${response.razorpay_order_id}.`);
        setQuote(null);
        await refresh(sid);
      },
    });
    rzp.on("payment.failed", async (response) => {
      await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          checkoutId: accept.checkoutId,
          failed: true,
          reason: response.error?.description || "Payment declined",
        }),
      });
      setNotice(
        `Payment failed: ${response.error?.description || "declined"}. Stop rule: no retry on this checkout. Cart is still here.`,
      );
    });
    rzp.open();
  }

  async function simulate(ok: boolean) {
    const accept = quote?.accepts[0];
    if (!sid || !accept) {
      await startCheckout();
      return;
    }
    if (!ok) {
      await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          checkoutId: accept.checkoutId,
          failed: true,
          reason: "Simulated decline (Razorpay test card path).",
        }),
      });
      setNotice("Simulated decline. Stop rule fired. Same checkout cannot be retried.");
      return;
    }
    await fetch("/api/checkout/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sid,
        checkoutId: accept.checkoutId,
        orderId: accept.orderId,
        paymentId: `pay_mock_${accept.checkoutId}`,
        signature: "mock",
      }),
    });
    setNotice(`Simulated capture on ${accept.orderId}. Drop test keys in .env to make this a real Dashboard payment.`);
    setQuote(null);
    await refresh(sid);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      <section className="flex min-h-[70vh] flex-col rounded-3xl border border-line bg-ink-2">
        <div className="border-b border-line px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Conversational checkout</p>
          <h1 className="font-[family-name:var(--font-serif)] text-3xl">Talk to the shop</h1>
          <p className="text-sm text-muted">
            Click Add to cart on a card, or tell the agent. Same cart. Same mandate.
          </p>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "ml-12 text-right" : "mr-6"}>
              <p
                className={`inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-gold text-ink" : "bg-ink text-paper"
                }`}
              >
                {m.text}
              </p>
              {m.products?.length ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {m.products.map((p) => (
                    <ProductCard key={p.sku} product={p} onAdd={addSku} />
                  ))}
                </div>
              ) : null}
              {m.upsell ? (
                <div className="mt-3 max-w-sm">
                  <ProductCard product={m.upsell} badge="Upsell" onAdd={addSku} />
                </div>
              ) : null}
            </div>
          ))}
          {busy ? <p className="text-sm text-muted">Searching the catalog…</p> : null}
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
            placeholder="filter coffee for 4 under ₹400"
            className="flex-1 rounded-full border border-line bg-ink px-4 py-3 text-sm outline-none focus:border-gold"
          />
          <button type="submit" className="rounded-full bg-gold px-5 py-3 text-sm font-medium text-ink">
            Send
          </button>
        </form>
      </section>

      <aside className="space-y-4">
        <div className="rounded-3xl border border-line bg-ink-2 p-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Cart</p>
          <h2 className="font-[family-name:var(--font-serif)] text-2xl">Your bag</h2>
          {!priced?.lines.length ? (
            <p className="mt-3 text-sm text-muted">Empty. Search, then click or say add.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {priced.lines.map((line) => (
                <li key={line.sku} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p>{line.name}</p>
                    <p className="text-muted">{formatInr(line.unitPaise)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void setQty(line.sku, line.qty - 1)} className="text-gold">
                      −
                    </button>
                    <span>{line.qty}</span>
                    <button type="button" onClick={() => void setQty(line.sku, line.qty + 1)} className="text-gold">
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between text-muted">
              <dt>Subtotal</dt>
              <dd>{formatInr(priced?.subtotalPaise ?? 0)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>{priced?.campaignName || "Campaign"}</dt>
              <dd>−{formatInr(priced?.discountPaise ?? 0)}</dd>
            </div>
            <div className="flex justify-between text-gold-2">
              <dt>Payable</dt>
              <dd>{formatInr(priced?.payablePaise ?? 0)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Mandate left</dt>
              <dd>{formatInr(mandate?.remainingPaise ?? 0)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => void startCheckout()}
            className="mt-4 w-full rounded-full bg-gold py-3 text-sm font-medium text-ink"
          >
            Checkout
          </button>
          {notice ? <p className="mt-3 text-xs leading-relaxed text-gold-2">{notice}</p> : null}
          {quote && !keysOn ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void simulate(true)}
                className="flex-1 rounded-full border border-line py-2 text-xs"
              >
                Simulate success
              </button>
              <button
                type="button"
                onClick={() => void simulate(false)}
                className="flex-1 rounded-full border border-danger/40 py-2 text-xs text-danger"
              >
                Simulate decline
              </button>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-line bg-ink-2 p-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold">u402 inspector</p>
          <h2 className="font-[family-name:var(--font-serif)] text-xl">Last quote</h2>
          <p className="mt-1 text-xs text-muted">
            {keysOn ? "Razorpay test keys detected." : "Waiting for rzp_test_ keys in .env.local"}
          </p>
          <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-ink p-3 font-[family-name:var(--font-mono)] text-[10px] leading-relaxed text-muted">
            {JSON.stringify(quote, null, 2) || "Checkout to see the 402 body, order id, and mandate remaining."}
          </pre>
        </div>
      </aside>
    </div>
  );
}
