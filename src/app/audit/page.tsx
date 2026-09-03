"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatInr } from "@/lib/money";
import type { AuditEvent, GrowthRow } from "@/lib/types";

type Tab = "adds" | "paid" | "failed" | "open" | "abandoned" | "all";

type SessionSnapshot = {
  sessionId: string;
  shopperId?: string;
  cartTouchedAt?: string;
  acceptedUpsell?: boolean;
  cart: Array<{ sku: string; qty: number; name: string }>;
  mandate: {
    id: string;
    maxPaise: number;
    remainingPaise: number;
    expiresAt: string;
  } | null;
  checkouts: Array<{
    id: string;
    status: string;
    amountPaise: number;
    orderId?: string;
    lines: Array<{ sku: string; name: string; qty: number }>;
    at: string;
    explanation?: string;
  }>;
  auditEventCount: number;
  auditRotated: boolean;
  leftCart?: boolean;
  canEmail: boolean;
  emailStatus: "no_shopper" | "no_email" | "ready" | "sent";
  emailMasked: string | null;
  username: string | null;
  abandonedEmailSentAt: string | null;
};

type Merchant = {
  cartAdds: Array<{ sku: string; name: string; count: number }>;
  paymentsPaid: Array<{
    id: string;
    sessionId: string;
    amountPaise: number;
    orderId?: string;
    lines: Array<{ sku: string; name: string; qty: number }>;
    at: string;
  }>;
  paymentsFailed: Array<{
    id: string;
    sessionId: string;
    amountPaise: number;
    lines: Array<{ sku: string; name: string; qty: number }>;
    at: string;
  }>;
  openQuotes: Array<{
    id: string;
    sessionId: string;
    amountPaise: number;
    orderId?: string;
    lines: Array<{ sku: string; name: string; qty: number }>;
    at: string;
  }>;
  abandonedCarts: Array<{
    sessionId: string;
    shopperId?: string;
    lines: Array<{ sku: string; qty: number; name: string }>;
    lineCount: number;
    canEmail: boolean;
    emailStatus: "no_shopper" | "no_email" | "ready" | "sent";
    emailMasked: string | null;
    username: string | null;
    abandonedEmailSentAt: string | null;
  }>;
};

function labelFor(type: string): { title: string; tone: "ok" | "warn" | "bad" | "neutral" } {
  const map: Record<string, { title: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
    "payment.captured": { title: "Payment captured", tone: "ok" },
    "payment.failed": { title: "Payment failed", tone: "bad" },
    "checkout.quoted": { title: "Checkout quoted (402)", tone: "ok" },
    "checkout.blocked": { title: "Blocked — no Order (403)", tone: "warn" },
    "checkout.dismissed": { title: "Payment window closed", tone: "neutral" },
    "cart.add": { title: "Added to cart", tone: "neutral" },
    "cart.remove": { title: "Removed from cart", tone: "neutral" },
    "shopper.registered": { title: "Shopper registered", tone: "ok" },
    "shopper.email_otp_sent": { title: "Email OTP sent", tone: "neutral" },
    "shopper.email_verified": { title: "Email verified", tone: "ok" },
    "shopper.abandoned_cart_email": { title: "Abandoned-cart email", tone: "ok" },
    "mandate.signed": { title: "Mandate signed", tone: "neutral" },
    "mandate.updated": { title: "Spend cap updated", tone: "neutral" },
  };
  if (map[type]) return map[type];
  if (type.startsWith("lab.")) return { title: `Lab · ${type.slice(4)}`, tone: "warn" };
  if (type.startsWith("cart.")) return { title: type.replace("cart.", "Cart · "), tone: "neutral" };
  return { title: type.replace(/\./g, " · "), tone: "neutral" };
}

function softReason(reason: string): string {
  return reason
    .replace(/\bman_[a-z0-9]+\b/gi, (id) => `mandate ${id.slice(0, 10)}…`)
    .replace(/\border_[A-Za-z0-9]+\b/g, (id) => `order ${id.slice(0, 14)}…`)
    .replace(/\bpay_[A-Za-z0-9]+\b/g, (id) => `payment ${id.slice(0, 12)}…`)
    .replace(/\bchk_[a-z0-9]+\b/gi, (id) => `checkout ${id.slice(0, 10)}…`);
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "All logs" },
  { id: "adds", label: "Cart adds" },
  { id: "paid", label: "Paid" },
  { id: "failed", label: "Failed" },
  { id: "open", label: "Open quotes" },
  { id: "abandoned", label: "Left carts" },
];

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[90rem] px-6 py-10">
          <p className="text-muted">Loading audit…</p>
        </main>
      }
    >
      <AuditPageInner />
    </Suspense>
  );
}

function AuditPageInner() {
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [sessionSnapshots, setSessionSnapshots] = useState<Record<string, SessionSnapshot>>({});
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [chain, setChain] = useState<{ ok: boolean; checked: number; brokenAt?: string } | null>(null);
  const [growth, setGrowth] = useState<{
    liveCount: number;
    seedCount: number;
    usingLive: boolean;
    aovWithoutUpsell: number;
    aovWithUpsell: number;
    liftPaise: number;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null);
  const [remindBusy, setRemindBusy] = useState(false);
  const [remindMsg, setRemindMsg] = useState<string | null>(null);
  const [sessionEmailBusy, setSessionEmailBusy] = useState(false);
  const [sessionEmailMsg, setSessionEmailMsg] = useState<string | null>(null);

  useEffect(() => {
    const tabParam = searchParams.get("tab") as Tab | null;
    const sessionParam = searchParams.get("session");
    const eventParam = searchParams.get("event");
    if (tabParam && TABS.some((t) => t.id === tabParam)) setTab(tabParam);
    if (sessionParam) setSessionId(sessionParam);
    if (eventParam) {
      setHighlightEventId(eventParam);
      setTab("all");
    }
  }, [searchParams]);

  useEffect(() => {
    const tick = async () => {
      const res = await fetch("/api/audit");
      const data = await res.json();
      setEvents(data.events);
      setSessionSnapshots(data.sessionSnapshots || {});
      setMerchant(data.merchant);
      setGrowth(data.growth);
      setChain(data.chain ?? null);
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  const sessionEvents = useMemo(() => {
    if (!sessionId) return [];
    return events.filter((e) => e.sessionId === sessionId);
  }, [events, sessionId]);

  const activeSnapshot = sessionId ? sessionSnapshots[sessionId] : null;

  async function refreshAudit() {
    const res = await fetch("/api/audit");
    const data = await res.json();
    setEvents(data.events);
    setSessionSnapshots(data.sessionSnapshots || {});
    setMerchant(data.merchant);
    setGrowth(data.growth);
    setChain(data.chain ?? null);
  }

  async function sendSessionReminder(force = false) {
    if (!sessionId) return;
    setSessionEmailBusy(true);
    setSessionEmailMsg(null);
    try {
      const res = await fetch("/api/merchant/abandoned-cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, minAgeMs: 0, force }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSessionEmailMsg(data.error || "Send failed");
        return;
      }
      setSessionEmailMsg(`Sent to ${data.email}`);
      await refreshAudit();
    } catch (e) {
      setSessionEmailMsg(e instanceof Error ? e.message : "Network error");
    } finally {
      setSessionEmailBusy(false);
    }
  }

  useEffect(() => {
    setSessionEmailMsg(null);
  }, [sessionId]);

  useEffect(() => {
    if (!highlightEventId) return;
    const el = document.getElementById(`audit-${highlightEventId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightEventId, sessionEvents, events]);

  return (
    <main className="mx-auto max-w-[90rem] px-6 py-10 lg:px-10">
      <p className="text-sm text-muted">
        Merchant console ·{" "}
        <Link href="/shop" className="hover:text-fg">
          Shop
        </Link>
        {" · "}
        <Link href="/lab" className="hover:text-fg">
          Gate lab
        </Link>
      </p>
      <h1 className="mt-1 font-[family-name:var(--font-serif)] text-4xl">Merchant audit</h1>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
        What got added, what paid, what failed, and carts that never finished — click a row to open
        that session&apos;s full log.
      </p>

      {chain ? (
        <p className={`mt-4 text-sm ${chain.ok ? "text-muted" : "text-accent"}`}>
          Hash chain: {chain.ok ? `OK (${chain.checked} events)` : `BROKEN at ${chain.brokenAt}`}
        </p>
      ) : null}

      {growth ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Avg without upsell" value={formatInr(growth.aovWithoutUpsell)} />
          <Stat label="Avg with upsell" value={formatInr(growth.aovWithUpsell)} />
          <Stat
            label="Lift (with − without)"
            value={formatInr(growth.liftPaise)}
          />
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setSessionId(null);
            }}
            className={`border px-3 py-1.5 text-sm ${
              tab === t.id ? "border-fg bg-fg text-bg" : "border-line hover:border-fg"
            }`}
          >
            {t.label}
            {merchant ? (
              <span className="ml-1 opacity-70">
                (
                {t.id === "adds"
                  ? merchant.cartAdds.reduce((n, r) => n + r.count, 0)
                  : t.id === "paid"
                    ? merchant.paymentsPaid.length
                    : t.id === "failed"
                      ? merchant.paymentsFailed.length
                      : t.id === "open"
                        ? merchant.openQuotes.length
                        : t.id === "abandoned"
                          ? merchant.abandonedCarts.length
                          : events.length}
                )
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section>
          {tab === "adds" && (
            <ul className="space-y-2">
              {!merchant?.cartAdds.length ? (
                <Empty />
              ) : (
                merchant.cartAdds.map((row) => (
                  <li key={row.sku} className="flex items-center justify-between border border-line bg-card px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{row.name}</p>
                      <p className="font-mono text-[11px] text-muted">{row.sku}</p>
                    </div>
                    <p className="font-[family-name:var(--font-serif)] text-2xl">{row.count}×</p>
                  </li>
                ))
              )}
            </ul>
          )}

          {tab === "paid" && (
            <CheckoutList
              rows={merchant?.paymentsPaid || []}
              empty="No captured payments yet."
              onOpen={setSessionId}
              active={sessionId}
            />
          )}
          {tab === "failed" && (
            <CheckoutList
              rows={merchant?.paymentsFailed || []}
              empty="No failed payments."
              onOpen={setSessionId}
              active={sessionId}
            />
          )}
          {tab === "open" && (
            <CheckoutList
              rows={merchant?.openQuotes || []}
              empty="No open 402 quotes waiting."
              onOpen={setSessionId}
              active={sessionId}
              hint="Quoted but not paid"
            />
          )}
          {tab === "abandoned" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 border border-line bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">Cart reminder emails</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Same job Azure will cron every ~30s. One email per cart — already sent shoppers are
                    skipped.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={remindBusy}
                  onClick={() => {
                    void (async () => {
                      setRemindBusy(true);
                      setRemindMsg(null);
                      try {
                        const res = await fetch("/api/merchant/abandoned-cart", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ minAgeMs: 0, force: true }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setRemindMsg(data.error || "Run failed");
                          return;
                        }
                        setRemindMsg(
                          `Scanned ${data.scanned} · sent ${data.sent} · skipped ${data.skipped}` +
                            (data.errors?.length ? ` · errors ${data.errors.length}` : ""),
                        );
                      } catch (e) {
                        setRemindMsg(e instanceof Error ? e.message : "Network error");
                      } finally {
                        setRemindBusy(false);
                      }
                    })();
                  }}
                  className="shrink-0 border border-fg bg-fg px-3 py-2 text-xs font-medium text-bg disabled:opacity-40"
                >
                  {remindBusy ? "Sending…" : "Send reminders now"}
                </button>
              </div>
              {remindMsg ? <p className="text-xs text-muted">{remindMsg}</p> : null}
              <ul className="space-y-2">
              {!merchant?.abandonedCarts.length ? (
                <Empty text="No carts sitting unpaid." />
              ) : (
                merchant.abandonedCarts.map((c) => (
                  <li key={c.sessionId}>
                    <button
                      type="button"
                      onClick={() => setSessionId(c.sessionId)}
                      className={`w-full border px-4 py-3 text-left hover:border-fg ${
                        sessionId === c.sessionId ? "border-fg bg-card" : "border-line bg-card"
                      }`}
                    >
                      <p className="font-mono text-xs text-muted">{c.sessionId}</p>
                      <p className="mt-1 text-sm">
                        {c.lineCount} item{c.lineCount === 1 ? "" : "s"} ·{" "}
                        {c.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        {c.emailStatus === "ready"
                          ? `Email ready · ${c.emailMasked}`
                          : c.emailStatus === "sent"
                            ? `Reminder sent · ${c.emailMasked}`
                            : c.emailStatus === "no_email"
                              ? "No verified email"
                              : "Guest / no shopper email"}
                      </p>
                    </button>
                  </li>
                ))
              )}
              </ul>
            </div>
          )}

          {tab === "all" && (
            <EventList
              events={events}
              onSession={setSessionId}
              activeSession={sessionId}
              highlightEventId={highlightEventId}
            />
          )}
        </section>

        <section className="w-full self-start border border-line bg-card lg:sticky lg:top-20">
          <div className="border-b border-line px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Session log</p>
            <p className="mt-1 font-mono text-sm text-fg">
              {sessionId || "Click a payment, quote, or cart to inspect"}
            </p>
          </div>
          <div className="max-h-[min(36rem,70vh)] space-y-3 overflow-y-auto p-4">
            {!sessionId ? (
              <p className="text-sm text-muted">
                Full event trail for one shopper session appears here — adds, quotes, captures,
                blocks.
              </p>
            ) : (
              <>
                {activeSnapshot ? (
                  <div className="space-y-3 border border-line p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                      Live session
                    </p>
                    {activeSnapshot.auditRotated ? (
                      <p className="text-xs text-muted">
                        Hash-chain ring rotated past this session&apos;s add/quote events — showing
                        current cart and checkouts instead.
                      </p>
                    ) : null}
                    {activeSnapshot.cart.length ? (
                      <div>
                        <p className="text-xs text-muted">Cart still open</p>
                        <ul className="mt-1 space-y-1 text-sm">
                          {activeSnapshot.cart.map((l) => (
                            <li key={l.sku}>
                              {l.qty}× {l.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Cart empty.</p>
                    )}
                    {activeSnapshot.leftCart ? (
                      <div className="space-y-2 border-t border-line pt-3">
                        <p className="text-xs text-muted">
                          {activeSnapshot.emailStatus === "ready"
                            ? `Verified email on file · ${activeSnapshot.emailMasked}`
                            : activeSnapshot.emailStatus === "sent"
                              ? `Already reminded · ${activeSnapshot.emailMasked}`
                              : activeSnapshot.emailStatus === "no_email"
                                ? "Shopper never verified email — can’t send yet."
                                : "No shopper email on this session (guest / MCP)."}
                        </p>
                        {activeSnapshot.canEmail ? (
                          <button
                            type="button"
                            disabled={sessionEmailBusy}
                            onClick={() =>
                              void sendSessionReminder(activeSnapshot.emailStatus === "sent")
                            }
                            className="w-full border border-fg bg-fg px-3 py-2 text-xs font-medium text-bg disabled:opacity-40"
                          >
                            {sessionEmailBusy
                              ? "Sending…"
                              : activeSnapshot.emailStatus === "sent"
                                ? "Send email again"
                                : "Send reminder email"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="w-full border border-line px-3 py-2 text-xs text-muted"
                          >
                            Send reminder email
                          </button>
                        )}
                        {sessionEmailMsg ? (
                          <p className="text-xs text-muted">{sessionEmailMsg}</p>
                        ) : null}
                      </div>
                    ) : null}
                    {activeSnapshot.mandate ? (
                      <p className="text-xs text-muted">
                        Mandate remaining {formatInr(activeSnapshot.mandate.remainingPaise)} /{" "}
                        {formatInr(activeSnapshot.mandate.maxPaise)}
                      </p>
                    ) : null}
                    {activeSnapshot.cartTouchedAt ? (
                      <p className="text-[11px] text-muted">
                        Last cart touch{" "}
                        {new Date(activeSnapshot.cartTouchedAt).toLocaleString()}
                      </p>
                    ) : null}
                    {activeSnapshot.checkouts.length ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted">Checkouts</p>
                        {activeSnapshot.checkouts.map((c) => (
                          <div key={c.id} className="border border-line px-3 py-2 text-sm">
                            <div className="flex justify-between gap-2">
                              <span className="capitalize">{c.status}</span>
                              <span className="tabular-nums">{formatInr(c.amountPaise)}</span>
                            </div>
                            <p className="mt-0.5 font-mono text-[10px] text-muted">{c.id}</p>
                            {c.explanation ? (
                              <p className="mt-1 text-xs text-muted">{softReason(c.explanation)}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {sessionEvents.length === 0 ? (
                  !activeSnapshot ? (
                    <p className="text-sm text-muted">No audit rows for this session yet.</p>
                  ) : activeSnapshot.auditRotated ? null : (
                    <p className="text-sm text-muted">No hash-chain events in the current ring.</p>
                  )
                ) : (
                  sessionEvents.map((e) => {
                    const { title, tone } = labelFor(e.type);
                    const hot = highlightEventId === e.id;
                    return (
                      <article
                        key={e.id}
                        id={`audit-${e.id}`}
                        className={`border p-3 transition-colors ${
                          hot
                            ? "border-fg bg-fg/5 ring-2 ring-fg/30"
                            : tone === "bad"
                              ? "border-danger/35"
                              : tone === "warn"
                                ? "border-accent/30"
                                : "border-line"
                        }`}
                      >
                        <div className="flex justify-between gap-2">
                          <h3 className="font-[family-name:var(--font-serif)] text-base">{title}</h3>
                          <time className="text-[11px] text-muted">
                            {new Date(e.at).toLocaleString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </time>
                        </div>
                        <p className="mt-1 font-mono text-[10px] text-muted">{e.id}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{softReason(e.reason)}</p>
                      </article>
                    );
                  })
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function CheckoutList({
  rows,
  empty,
  onOpen,
  active,
  hint,
}: {
  rows: Array<{
    id: string;
    sessionId: string;
    amountPaise: number;
    orderId?: string;
    lines: Array<{ sku: string; name: string; qty: number }>;
    at: string;
  }>;
  empty: string;
  onOpen: (id: string) => void;
  active: string | null;
  hint?: string;
}) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onOpen(c.sessionId)}
            className={`w-full border px-4 py-3 text-left hover:border-fg ${
              active === c.sessionId ? "border-fg bg-card" : "border-line bg-card"
            }`}
          >
            <div className="flex justify-between gap-2">
              <p className="font-[family-name:var(--font-serif)] text-xl">
                {formatInr(c.amountPaise)}
              </p>
              <time className="text-[11px] text-muted">{new Date(c.at).toLocaleString()}</time>
            </div>
            {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
            <p className="mt-1 text-sm text-muted">
              {c.lines.map((l) => `${l.qty}× ${l.name}`).join(", ") || "—"}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted">
              {c.sessionId}
              {c.orderId ? ` · ${c.orderId}` : ""}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EventList({
  events,
  onSession,
  activeSession,
  highlightEventId,
}: {
  events: AuditEvent[];
  onSession: (id: string) => void;
  activeSession: string | null;
  highlightEventId?: string | null;
}) {
  if (!events.length) return <Empty />;
  return (
    <ol className="space-y-2">
      {events.slice(0, 60).map((e) => {
        const { title, tone } = labelFor(e.type);
        const hot = highlightEventId === e.id;
        return (
          <li key={e.id} id={hot ? `audit-${e.id}` : undefined}>
            <button
              type="button"
              onClick={() => onSession(e.sessionId)}
              className={`w-full border px-4 py-3 text-left hover:border-fg ${
                hot
                  ? "border-fg bg-fg/5 ring-2 ring-fg/25"
                  : activeSession === e.sessionId
                    ? "border-fg bg-card"
                    : "border-line bg-card"
              } ${tone === "bad" ? "border-danger/30" : ""}`}
            >
              <div className="flex justify-between gap-2">
                <span className="text-sm font-medium">{title}</span>
                <time className="text-[11px] text-muted">
                  {new Date(e.at).toLocaleTimeString()}
                </time>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{softReason(e.reason)}</p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Empty({ text = "Nothing yet." }: { text?: string }) {
  return <p className="border border-line bg-card p-5 text-sm text-muted">{text}</p>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-serif)] text-2xl">{value}</p>
    </div>
  );
}
