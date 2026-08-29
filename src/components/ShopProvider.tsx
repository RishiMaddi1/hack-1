"use client";

import Script from "next/script";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getProduct } from "@/lib/catalog";
import { formatInr } from "@/lib/money";
import type { ChatMessage, Mandate, U402Quote } from "@/lib/types";

export type Priced = {
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

function readSession() {
  const key = "u402_session";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `ses_${crypto.randomUUID().slice(0, 12)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

type ShopContext = {
  sid: string;
  priced: Priced | null;
  mandate: Mandate | null;
  quote: U402Quote | null;
  notice: string | null;
  keysOn: boolean;
  llmOn: boolean;
  messages: ChatMessage[];
  text: string;
  setText: (v: string) => void;
  busy: boolean;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  askOpen: boolean;
  setAskOpen: (v: boolean) => void;
  cartCount: number;
  addSku: (sku: string, fromChat?: boolean) => Promise<void>;
  setQty: (sku: string, qty: number) => Promise<void>;
  send: (message?: string) => Promise<void>;
  openRazorpayForQuote: (body: U402Quote) => Promise<void>;
  setCap: (maxPaise: number) => Promise<void>;
  simulate: (ok: boolean) => Promise<void>;
};

const Ctx = createContext<ShopContext | null>(null);

export function useShop() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShop needs ShopProvider");
  return ctx;
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [sid, setSid] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "hello",
      role: "assistant",
      text: "Tell me the desk. I’ll search, add, and stay inside your spend mandate.\nWhen you’re ready, type pay — I create the Razorpay Order. You only confirm the card. That’s the gate.",
    },
  ]);
  const [priced, setPriced] = useState<Priced | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [quote, setQuote] = useState<U402Quote | null>(null);
  const [keysOn, setKeysOn] = useState(false);
  const [llmOn, setLlmOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(true);

  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`/api/cart?sessionId=${id}`);
    const data = (await res.json()) as { priced: Priced; mandate: Mandate };
    setPriced(data.priced);
    setMandate(data.mandate);
  }, []);

  useEffect(() => {
    const id = readSession();
    setSid(id);
    void refresh(id);
    void fetch("/api/status")
      .then((r) => r.json())
      .then((s: { razorpayTest: boolean; llm: boolean }) => {
        setKeysOn(s.razorpayTest);
        setLlmOn(s.llm);
      });
  }, [refresh]);

  const addSku = useCallback(
    async (sku: string, fromChat = false) => {
      if (!sid) return;
      await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, action: "add", sku, qty: 1 }),
      });
      const product = getProduct(sku);
      if (fromChat && product) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: `Added ${product.name}. Say pay when you’re ready.`,
          },
        ]);
        setAskOpen(true);
      } else {
        setCartOpen(true);
      }
      await refresh(sid);
    },
    [sid, refresh],
  );

  const setQty = useCallback(
    async (sku: string, qty: number) => {
      if (!sid) return;
      await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, action: "set", sku, qty }),
      });
      await refresh(sid);
    },
    [sid, refresh],
  );

  const openRazorpayForQuote = useCallback(
    async (body: U402Quote) => {
      const accept = body.accepts[0];
      if (!accept || body.error !== "payment_required") return;

      if (!keysOn || accept.network === "razorpay_mock") {
        setNotice("Test keys aren’t loaded. Use simulate success / decline in chat to rehearse.");
        setAskOpen(true);
        return;
      }

      const started = Date.now();
      while (!window.Razorpay && Date.now() - started < 4000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!window.Razorpay) {
        setNotice("Payment window is still loading. Say pay again.");
        setAskOpen(true);
        return;
      }

      let settled = false;
      const rzp = new window.Razorpay({
        key: accept.keyId,
        amount: accept.amountPaise,
        currency: "INR",
        order_id: accept.orderId,
        name: "Circuit",
        description: body.breakdown.explanation.slice(0, 120),
        modal: {
          ondismiss: () => {
            if (settled) return;
            settled = true;
            const closed = [
              "Payment window closed — nothing charged.",
              `Order ${accept.orderId} was not paid.`,
              "Your cart is still here. Type pay when you’re ready to try again.",
            ].join(" ");
            setNotice(closed);
            setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: closed }]);
            setAskOpen(true);
            void fetch("/api/checkout/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: sid,
                checkoutId: accept.checkoutId,
                dismissed: true,
              }),
            });
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          settled = true;
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
          await refresh(sid);
          const paid = [
            "Order done.",
            `Amount ${formatInr(accept.amountPaise)}.`,
            `Order ${response.razorpay_order_id}.`,
            `Payment ${response.razorpay_payment_id}.`,
            `Checkout ${accept.checkoutId}.`,
            "Cart cleared. Check /audit for the trail.",
          ].join(" ");
          setNotice(paid);
          setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: paid }]);
          setQuote(null);
          setAskOpen(true);
        },
      });
      rzp.on("payment.failed", async (response) => {
        settled = true;
        const reason = response.error?.description || "Payment declined";
        await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            checkoutId: accept.checkoutId,
            failed: true,
            reason,
          }),
        });
        const failed = [
          "Payment failed.",
          reason + ".",
          `Order ${accept.orderId} will not be retried (stop rule).`,
          "Your cart is still here — say pay only after you change the bag or raise the mandate.",
        ].join(" ");
        setNotice(failed);
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: failed }]);
        setAskOpen(true);
      });
      rzp.open();
    },
    [sid, keysOn, refresh],
  );

  const send = useCallback(
    async (message?: string) => {
      const payload = (message ?? text).trim();
      if (!payload || !sid) return;
      setText("");
      setBusy(true);
      setAskOpen(true);
      setCartOpen(false);
      setNotice(null);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: payload }]);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, text: payload }),
      });
      const data = (await res.json()) as { message: ChatMessage };
      setMessages((m) => [...m, data.message]);
      if (data.message.quote) {
        setQuote(data.message.quote);
        if (
          data.message.quote.error === "mandate_exceeded" ||
          data.message.quote.error === "mandate_expired" ||
          data.message.quote.error === "mandate_bad_signature"
        ) {
          setNotice(
            data.message.quote.error === "mandate_expired"
              ? "Mandate expired — pick a spend cap in Cart to re-authorise."
              : data.message.quote.error === "mandate_bad_signature"
                ? "Mandate signature failed — buyer authority did not sign this claim."
                : `Over your spend mandate — only ${formatInr(data.message.quote.mandate.remainingPaise)} left. Raise the cap in Cart, or pick a cheaper bag.`,
          );
        } else if (data.message.quote.error === "payment_required") {
          setNotice(
            `Agent quoted ${data.message.quote.accepts[0]?.orderId}. Confirm the card on Razorpay.`,
          );
          await openRazorpayForQuote(data.message.quote);
        }
      }
      await refresh(sid);
      setBusy(false);
    },
    [sid, text, refresh, openRazorpayForQuote],
  );

  const setCap = useCallback(
    async (maxPaise: number) => {
      if (!sid) return;
      await fetch("/api/mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, maxPaise }),
      });
      await refresh(sid);
    },
    [sid, refresh],
  );

  const simulate = useCallback(
    async (ok: boolean) => {
      const accept = quote?.accepts[0];
      if (!sid || !accept || quote?.error !== "payment_required") {
        await send("pay");
        return;
      }
      setAskOpen(true);
      if (!ok) {
        await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            checkoutId: accept.checkoutId,
            failed: true,
            reason: "Simulated decline.",
          }),
        });
        const failed = "Declined. Same checkout cannot be retried.";
        setNotice(failed);
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: failed }]);
        return;
      }
      const paymentId = `pay_mock_${accept.checkoutId}`;
      await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          checkoutId: accept.checkoutId,
          orderId: accept.orderId,
          paymentId,
          signature: "mock",
        }),
      });
      await refresh(sid);
      const paid = [
        "Order done.",
        `Amount ${formatInr(accept.amountPaise)}.`,
        `Order ${accept.orderId}.`,
        `Payment ${paymentId}.`,
        `Checkout ${accept.checkoutId}.`,
        "Cart cleared. Check /audit for the trail.",
      ].join(" ");
      setNotice(paid);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: paid }]);
      setQuote(null);
    },
    [quote, sid, send, refresh],
  );

  const cartCount = priced?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;

  const value = useMemo(
    () => ({
      sid,
      priced,
      mandate,
      quote,
      notice,
      keysOn,
      llmOn,
      messages,
      text,
      setText,
      busy,
      cartOpen,
      setCartOpen,
      askOpen,
      setAskOpen,
      cartCount,
      addSku,
      setQty,
      send,
      openRazorpayForQuote,
      setCap,
      simulate,
    }),
    [
      sid,
      priced,
      mandate,
      quote,
      notice,
      keysOn,
      llmOn,
      messages,
      text,
      busy,
      cartOpen,
      askOpen,
      cartCount,
      addSku,
      setQty,
      send,
      openRazorpayForQuote,
      setCap,
      simulate,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      {children}
    </Ctx.Provider>
  );
}
