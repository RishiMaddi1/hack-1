"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatInr } from "@/lib/money";

type PayPayload = {
  orderId: string;
  checkoutId?: string;
  payToken?: string;
  status: string;
  amountPaise: number;
  currency?: string;
  keyId?: string;
  network?: string;
  explanation: string;
  lines: Array<{ name: string; qty: number; linePaise: number }>;
};

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void;
    };
  }
}

export function PayOrderClient({ orderId }: { orderId: string }) {
  const [data, setData] = useState<PayPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const autoOpened = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pay/${encodeURIComponent(orderId)}`);
        const body = (await res.json()) as PayPayload & { error?: string };
        if (!res.ok) {
          if (!cancelled) setLoadError(body.error || "Could not load order");
          return;
        }
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setLoadError("Network error loading order");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const openPay = useCallback(async () => {
    if (!data || data.status === "paid" || done) return;
    if (!data.payToken || !data.keyId || !data.orderId) {
      setPayError("Pay session incomplete — reload this page.");
      return;
    }
    setBusy(true);
    setPayError(null);

    if (data.network === "razorpay_mock") {
      setPayError("Razorpay test keys missing — cannot open Checkout.");
      setBusy(false);
      return;
    }

    const started = Date.now();
    while (!window.Razorpay && Date.now() - started < 5000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!window.Razorpay) {
      setPayError("Razorpay Checkout script failed to load.");
      setBusy(false);
      return;
    }

    const payToken = data.payToken;
    let settled = false;
    const rzp = new window.Razorpay({
      key: data.keyId,
      amount: data.amountPaise,
      currency: data.currency || "INR",
      order_id: data.orderId,
      name: "Circuit",
      description: data.explanation.slice(0, 120),
      modal: {
        ondismiss: () => {
          if (settled) return;
          settled = true;
          setBusy(false);
          setPayError("Payment window closed — nothing charged. You can try again.");
          void fetch(`/api/pay/${encodeURIComponent(data.orderId)}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payToken, dismissed: true }),
          });
        },
      },
      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        settled = true;
        const res = await fetch(`/api/pay/${encodeURIComponent(data.orderId)}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payToken,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          }),
        });
        const body = (await res.json()) as { error?: string; record?: { paymentId?: string } };
        setBusy(false);
        if (!res.ok) {
          setPayError(body.error || "Confirm failed — try again.");
          return;
        }
        setDone(body.record?.paymentId || response.razorpay_payment_id);
      },
    });
    rzp.on("payment.failed", (r) => {
      if (settled) return;
      settled = true;
      setBusy(false);
      setPayError(r.error?.description || "Payment failed. Try again with another method.");
    });
    rzp.open();
  }, [data, done]);

  useEffect(() => {
    if (!data || data.status === "paid" || done || autoOpened.current) return;
    if (data.status !== "quoted" && data.status !== "failed") return;
    autoOpened.current = true;
    void openPay();
  }, [data, done, openPay]);

  if (loadError && !data) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <p className="text-sm uppercase tracking-wide text-muted">Checkout</p>
        <h1 className="mt-2 font-[family-name:var(--font-serif)] text-3xl">Order not found</h1>
        <p className="mt-3 text-muted">{loadError}</p>
        <a href="/shop" className="mt-10 inline-block w-fit border border-line px-5 py-2.5 text-sm">
          Back to shop
        </a>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <p className="text-muted">Loading checkout…</p>
      </main>
    );
  }

  if (data.status === "paid" || done) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <p className="text-sm uppercase tracking-wide text-muted">Payment captured</p>
        <h1 className="mt-2 font-[family-name:var(--font-serif)] text-4xl">{formatInr(data.amountPaise)}</h1>
        <p className="mt-3 font-mono text-xs text-muted">{done || "paid"}</p>
        <a href="/shop" className="mt-10 inline-block w-fit bg-fg px-6 py-3 text-bg">
          Back to shop
        </a>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(ellipse_at_top,_rgba(0,0,0,0.06),_transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.06),_transparent_70%)]"
      />
      <p className="text-sm uppercase tracking-wide text-muted">Pay Circuit</p>
      <h1 className="mt-2 font-[family-name:var(--font-serif)] text-5xl tracking-tight">
        {formatInr(data.amountPaise)}
      </h1>
      <p className="mt-3 text-sm text-muted">Confirm on Razorpay — card details stay with them.</p>

      <ul className="mt-10 space-y-3 border-y border-line py-6">
        {data.lines.map((l) => (
          <li key={`${l.name}-${l.qty}`} className="flex items-baseline justify-between gap-4 text-sm">
            <span>
              {l.qty > 1 ? `${l.qty}× ` : ""}
              {l.name}
            </span>
            <span className="shrink-0 tabular-nums">{formatInr(l.linePaise)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 font-mono text-[11px] text-muted">{data.orderId}</p>

      {payError ? (
        <div className="mt-6 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {payError}
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void openPay()}
        className="mt-8 w-full bg-fg py-3.5 text-bg disabled:opacity-40"
      >
        {busy ? "Opening Razorpay…" : payError ? "Pay again" : "Pay with Razorpay"}
      </button>
    </main>
  );
}
