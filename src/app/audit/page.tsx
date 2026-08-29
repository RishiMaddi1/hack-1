"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatInr } from "@/lib/money";
import type { AuditEvent, GrowthRow } from "@/lib/types";

function labelFor(type: string): { title: string; tone: "ok" | "warn" | "bad" | "neutral" } {
  const map: Record<string, { title: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
    "payment.captured": { title: "Payment captured", tone: "ok" },
    "payment.failed": { title: "Payment failed", tone: "bad" },
    "checkout.quoted": { title: "Checkout quoted (402)", tone: "ok" },
    "checkout.blocked": { title: "Blocked — no Order (403)", tone: "warn" },
    "checkout.dismissed": { title: "Payment window closed", tone: "neutral" },
    "mandate.verify_ok": { title: "Mandate verified", tone: "ok" },
    "mandate.verify_fail": { title: "Mandate signature rejected", tone: "bad" },
    "mandate.signed": { title: "Mandate signed", tone: "neutral" },
    "mandate.updated": { title: "Spend cap updated", tone: "neutral" },
    "mandate.expired": { title: "Mandate expired", tone: "warn" },
    "cart.clear": { title: "Cart cleared", tone: "neutral" },
    "cart.add": { title: "Added to cart", tone: "neutral" },
    "cart.remove": { title: "Removed from cart", tone: "neutral" },
    "upsell.proposed": { title: "Upsell suggested", tone: "ok" },
    "upsell.refused": { title: "Upsell skipped (over cap)", tone: "warn" },
    "catalog.search": { title: "Catalog search", tone: "neutral" },
    "lab.forge_remaining": { title: "Lab · forged remaining", tone: "bad" },
    "lab.replay_stale": { title: "Lab · stale mandate replay", tone: "bad" },
    "lab.bad_webhook": { title: "Lab · bad webhook signature", tone: "bad" },
  };
  if (map[type]) return map[type];
  if (type.startsWith("webhook") || type.includes("payment.captured")) {
    return { title: type.includes("webhook") ? "Razorpay webhook" : type, tone: "ok" };
  }
  if (type.startsWith("lab.")) return { title: `Lab · ${type.slice(4)}`, tone: "warn" };
  if (type.startsWith("cart.")) return { title: type.replace("cart.", "Cart · "), tone: "neutral" };
  return { title: type.replace(/\./g, " · "), tone: "neutral" };
}

function softReason(reason: string): string {
  return reason
    .replace(/\bman_[a-z0-9]+\b/gi, (id) => `mandate ${id.slice(0, 10)}…`)
    .replace(/\border_[A-Za-z0-9]+\b/g, (id) => `order ${id.slice(0, 14)}…`)
    .replace(/\bpay_[A-Za-z0-9]+\b/g, (id) => `payment ${id.slice(0, 12)}…`)
    .replace(/\bchk_[a-z0-9]+\b/gi, (id) => `checkout ${id.slice(0, 10)}…`)
    .replace(/\bkid buyer-mandate-v1\b/g, "buyer key")
    .replace(/\balg Ed25519\b/g, "Ed25519");
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [growth, setGrowth] = useState<{
    sessions: GrowthRow[];
    liveCount: number;
    seedCount: number;
    usingLive: boolean;
    aovWithoutUpsell: number;
    aovWithUpsell: number;
    liftPaise: number;
  } | null>(null);

  useEffect(() => {
    const tick = async () => {
      const res = await fetch("/api/audit");
      const data = await res.json();
      setEvents(data.events);
      setGrowth(data.growth);
    };
    void tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-sm text-muted">
        Merchant console · not the shopper ·{" "}
        <Link href="/shop" className="hover:text-fg">
          Back to shop
        </Link>
        {" · "}
        <Link href="/lab" className="hover:text-fg">
          Gate lab
        </Link>
      </p>
      <h1 className="mt-1 font-[family-name:var(--font-serif)] text-4xl">Order log</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Every money step in plain language — quoted, blocked, paid, or failed. For you (the merchant) and a
        panel checking that spend was explained, stayed inside the buyer’s cap, and was checked{" "}
        <em>before</em> any Razorpay Order.
      </p>

      {growth ? (
        <section className="mt-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Bag size</p>
          <p className="mt-1 text-sm text-muted">
            {growth.usingLive
              ? `${growth.liveCount} real checkout${growth.liveCount === 1 ? "" : "s"} so far`
              : `Demo baseline until someone pays (${growth.seedCount} sample baskets)`}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Avg without upsell" value={formatInr(growth.aovWithoutUpsell)} />
            <Stat label="Avg with upsell" value={formatInr(growth.aovWithUpsell)} />
            <Stat label="Lift" value={formatInr(growth.liftPaise)} />
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Activity</p>
        <ol className="mt-3 space-y-3">
          {events.length === 0 ? (
            <li className="border border-line bg-card p-5 text-sm text-muted">
              Nothing yet. Complete a pay or open Gate lab, then come back.
            </li>
          ) : (
            events.map((e) => {
              const { title, tone } = labelFor(e.type);
              return (
                <li
                  key={e.id}
                  className={`border bg-card p-4 ${
                    tone === "ok"
                      ? "border-line"
                      : tone === "warn"
                        ? "border-accent/30"
                        : tone === "bad"
                          ? "border-danger/35"
                          : "border-line"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2
                      className={`font-[family-name:var(--font-serif)] text-lg leading-tight ${
                        tone === "bad" ? "text-danger" : tone === "warn" ? "text-accent" : "text-fg"
                      }`}
                    >
                      {title}
                    </h2>
                    <time className="text-[11px] text-muted" dateTime={e.at}>
                      {new Date(e.at).toLocaleString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-fg/90">{softReason(e.reason)}</p>
                </li>
              );
            })
          )}
        </ol>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-serif)] text-2xl">{value}</p>
    </div>
  );
}
