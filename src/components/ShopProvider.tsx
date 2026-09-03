"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
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
import { ShopperGate, clearStoredShopper, persistShopper, readStoredShopper, type ShopperAuth } from "./ShopperGate";

const HELLO_MESSAGE: ChatMessage = {
  id: "hello",
  role: "assistant",
  text: "Tell me what you need from the catalog and I’ll search and add. Ask what’s in the bag or about offers anytime. Type pay when you’re ready to quote Razorpay.",
  suggestions: [
    "show me something under 2000",
    "what offers are live?",
    "show me a cheap mouse",
  ],
};

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

type ShopContext = {
  sid: string;
  username: string | null;
  shopperToken: string;
  /** True while restoring session from storage on /shop */
  authLoading: boolean;
  isSignedIn: boolean;
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
  openLogin: () => void;
  logout: () => void;
};

const Ctx = createContext<ShopContext | null>(null);

export function useShop() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShop needs ShopProvider");
  return ctx;
}

function authHeaders(token: string, json = true): HeadersInit {
  const h: Record<string, string> = { "X-Shopper-Token": token };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const needsShopperGate = pathname === "/shop" || pathname.startsWith("/shop/");
  const onPayPage = pathname.startsWith("/pay");
  const [auth, setAuth] = useState<ShopperAuth | null>(null);
  const [gateDone, setGateDone] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMode, setGateMode] = useState<"register" | "login">("register");
  /** False until we've checked localStorage /me — avoids signup flash on hard refresh. */
  const [authReady, setAuthReady] = useState(false);
  const [sid, setSid] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([HELLO_MESSAGE]);
  const [priced, setPriced] = useState<Priced | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [quote, setQuote] = useState<U402Quote | null>(null);
  const [keysOn, setKeysOn] = useState(false);
  const [llmOn, setLlmOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    if (!onPayPage) return;
    setAskOpen(false);
    setCartOpen(false);
  }, [onPayPage]);

  // Chat is a shop tool — don't leave it open over audit/lab/home.
  useEffect(() => {
    if (needsShopperGate) return;
    setAskOpen(false);
  }, [needsShopperGate]);

  const token = auth?.shopperToken || "";

  const refresh = useCallback(async (tok: string) => {
    const res = await fetch("/api/cart", { headers: { "X-Shopper-Token": tok } });
    if (!res.ok) return;
    const data = (await res.json()) as { priced: Priced; mandate: Mandate };
    setPriced(data.priced);
    setMandate(data.mandate);
  }, []);

  useEffect(() => {
    void fetch("/api/status")
      .then((r) => r.json())
      .then((s: { razorpayTest: boolean; llm: boolean }) => {
        setKeysOn(s.razorpayTest);
        setLlmOn(s.llm);
      });
    const stored = readStoredShopper();
    if (!stored) {
      setGateDone(false);
      setAuthReady(true);
      return;
    }
    void fetch("/api/shoppers", {
      method: "POST",
      headers: authHeaders(stored.token),
      body: JSON.stringify({ action: "me" }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setGateDone(false);
          return;
        }
        if (!data.budgetSet) {
          setAuth({
            username: data.username,
            shopperToken: stored.token,
            sessionId: data.sessionId,
            budgetSet: false,
          });
          setGateDone(false);
          return;
        }
        persistShopper(data.username, stored.token, data.sessionId);
        setAuth({
          username: data.username,
          shopperToken: stored.token,
          sessionId: data.sessionId,
          budgetSet: true,
        });
        setSid(data.sessionId);
        setGateDone(true);
        // Don't auto-open buyer chat on refresh — only when user opens it (or after fresh login on /shop).
        await refresh(stored.token);
      })
      .catch(() => setGateDone(false))
      .finally(() => setAuthReady(true));
  }, [refresh]);

  const onGateReady = useCallback(
    (next: ShopperAuth) => {
      persistShopper(next.username, next.shopperToken, next.sessionId);
      setAuth(next);
      setSid(next.sessionId);
      setGateDone(true);
      setGateOpen(false);
      // Fresh login/budget: open chat only on the shop, not audit/lab/home.
      if (needsShopperGate) setAskOpen(true);
      void refresh(next.shopperToken);
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Signed in as ${next.username}. Budget is set — search, add, ask about offers, then type pay.`,
        },
      ]);
    },
    [refresh, needsShopperGate],
  );

  const openLogin = useCallback(() => {
    setCartOpen(false);
    setAskOpen(false);
    setGateMode("login");
    setGateOpen(true);
  }, []);

  const logout = useCallback(() => {
    clearStoredShopper();
    setAuth(null);
    setSid("");
    setGateDone(false);
    setGateMode("login");
    setGateOpen(true);
    setPriced(null);
    setMandate(null);
    setQuote(null);
    setNotice(null);
    setCartOpen(false);
    setAskOpen(false);
    setMessages([HELLO_MESSAGE]);
  }, []);

  const addSku = useCallback(
    async (sku: string, fromChat = false) => {
      if (!token || !sid) return;
      await fetch("/api/cart", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ action: "add", sku, qty: 1 }),
      });
      const product = getProduct(sku);
      if (fromChat && product) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: `Added ${product.name}. Say pay when you’re ready.`,
            showCart: true,
            suggestions: ["pay", "what's in my bag", "show me an upgrade"],
          },
        ]);
        setAskOpen(true);
      } else {
        setCartOpen(true);
      }
      await refresh(token);
    },
    [sid, token, refresh],
  );

  const setQty = useCallback(
    async (sku: string, qty: number) => {
      if (!token) return;
      await fetch("/api/cart", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ action: "set", sku, qty }),
      });
      await refresh(token);
    },
    [token, refresh],
  );

  const openRazorpayForQuote = useCallback(
    async (body: U402Quote) => {
      const accept = body.accepts[0];
      if (!accept || body.error !== "payment_required") return;

      if (!keysOn || accept.network === "razorpay_mock") {
        const link = body.paymentLinkUrl || accept.paymentLinkUrl;
        setNotice(
          link
            ? `Mock / offline keys. Payment link for agents: ${link}. Use simulate in chat to rehearse capture.`
            : "Test keys aren’t loaded. Use simulate success / decline in chat to rehearse.",
        );
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
          await refresh(token);
          const receipt: NonNullable<ChatMessage["receipt"]> = {
            amountPaise: accept.amountPaise,
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            checkoutId: accept.checkoutId,
            lines: body.breakdown.lines,
            campaignName: body.breakdown.campaignName,
            discountPaise: body.breakdown.discountPaise,
          };
          setNotice("Paid — cart cleared.");
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: "Paid.",
              receipt,
            },
          ]);
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
      // Close our overlay first — Razorpay Checkout sits under the buyer-agent drawer otherwise.
      setAskOpen(false);
      setCartOpen(false);
      await new Promise((r) => setTimeout(r, 80));
      try {
        rzp.open();
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Could not open Razorpay Checkout.";
        setNotice(detail);
        setAskOpen(true);
      }
    },
    [sid, keysOn, refresh, token, setAskOpen, setCartOpen],
  );

  const send = useCallback(
    async (message?: string) => {
      const payload = (message ?? text).trim();
      if (!payload || !token) return;
      setText("");
      setBusy(true);
      setAskOpen(true);
      setCartOpen(false);
      setNotice(null);
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-12)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          text: m.text,
          skus: m.products?.map((p) => p.sku),
          upsellSku: m.upsell?.sku,
          pairSkus: m.crossSell?.map((p) => p.sku),
        }));
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: payload }]);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ text: payload, history }),
        });
        const data = (await res.json()) as {
          message?: ChatMessage;
          error?: string;
          messageText?: string;
        };
        if (!res.ok || !data.message) {
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: (typeof data.error === "string" ? data.error : null) || "Chat blocked — check budget.",
            },
          ]);
          return;
        }
        setMessages((m) => [...m, data.message!]);
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
            // Clear busy before opening Checkout so UI doesn't stay stuck on "Working the tools…"
            setBusy(false);
            await openRazorpayForQuote(data.message.quote);
          }
        }
        await refresh(token);
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Chat request failed.";
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: "assistant", text: detail },
        ]);
        setNotice(detail);
      } finally {
        setBusy(false);
      }
    },
    [token, text, messages, refresh, openRazorpayForQuote],
  );

  const setCap = useCallback(
    async (maxPaise: number) => {
      if (!token) return;
      await fetch("/api/shoppers", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ action: "set_budget", maxRupees: maxPaise / 100 }),
      });
      await refresh(token);
    },
    [token, refresh],
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
      await refresh(token);
      const receipt: NonNullable<ChatMessage["receipt"]> = {
        amountPaise: accept.amountPaise,
        orderId: accept.orderId,
        paymentId,
        checkoutId: accept.checkoutId,
        lines: quote.breakdown.lines,
        campaignName: quote.breakdown.campaignName,
        discountPaise: quote.breakdown.discountPaise,
      };
      setNotice("Paid — cart cleared.");
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Paid.",
          receipt,
        },
      ]);
      setQuote(null);
    },
    [quote, sid, send, refresh, token],
  );

  const cartCount = priced?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;
  const isSignedIn = Boolean(gateDone && auth?.budgetSet);
  const authLoading = needsShopperGate && !authReady;

  const value = useMemo(
    () => ({
      sid,
      username: auth?.username ?? null,
      shopperToken: token,
      authLoading,
      isSignedIn,
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
      openLogin,
      logout,
    }),
    [
      sid,
      auth?.username,
      token,
      authLoading,
      isSignedIn,
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
      openLogin,
      logout,
    ],
  );

  const showGate =
    needsShopperGate &&
    authReady &&
    (gateOpen || !gateDone || (auth != null && !auth.budgetSet));

  return (
    <Ctx.Provider value={value}>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      {authLoading ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/90 backdrop-blur-sm">
          <div className="border border-line bg-card px-8 py-6 text-center shadow-none">
            <p className="font-[family-name:var(--font-serif)] text-xl text-fg">Circuit</p>
            <p className="mt-3 text-sm text-muted">Checking your shopper session…</p>
            <div className="mx-auto mt-4 h-1 w-24 overflow-hidden rounded-full bg-line">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-fg" />
            </div>
          </div>
        </div>
      ) : null}
      {showGate && (
        <ShopperGate
          onReady={onGateReady}
          resume={auth && !auth.budgetSet ? auth : null}
          initialMode={gateMode}
        />
      )}
      {children}
    </Ctx.Provider>
  );
}
