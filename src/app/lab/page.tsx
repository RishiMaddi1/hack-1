"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type LabLogLine = {
  t: string;
  level: "info" | "try" | "check" | "pass" | "block" | "warn" | "sys";
  msg: string;
};

type LabResult = {
  attack?: string;
  blocked?: boolean;
  auditId?: string;
  auditReason?: string;
  log?: LabLogLine[];
  gate?: { ok: boolean; reason?: string; code?: string };
  error?: string;
};

const ATTACKS: Array<{ id: string; title: string; try: string }> = [
  {
    id: "forge_remaining",
    title: "Forge remaining",
    try: "Bump remainingPaise 10× on a copied mandate JSON — no buyer re-sign.",
  },
  {
    id: "replay_stale",
    title: "Replay stale mandate",
    try: "Lower the live cap, then present the old high-remaining artifact.",
  },
  {
    id: "expire_now",
    title: "Expire mandate",
    try: "Rewrite expiresAt to the past and attempt checkout.",
  },
  {
    id: "bad_webhook",
    title: "Bad webhook HMAC",
    try: "Sign payment.captured with the wrong webhook secret.",
  },
  {
    id: "double_capture",
    title: "Double capture race",
    try: "Fire webhook capture and client confirm on the same Order.",
  },
  {
    id: "underpay",
    title: "Underpay injection",
    try: "Ask quoteCheckout for amountPaise=100 while the cart is ₹599.",
  },
];

const LEVEL: Record<string, string> = {
  sys: "SYS",
  info: "INFO",
  try: "TRY",
  check: "CHECK",
  pass: "OK",
  block: "BLOCK",
  warn: "WARN",
};

export default function LabPage() {
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<LabResult | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);

  useEffect(() => {
    const key = "u402_session";
    let sid = "";
    try {
      sid = localStorage.getItem(key) || "";
    } catch {
      /* ignore */
    }
    if (!sid) {
      sid = `ses_${crypto.randomUUID().slice(0, 12)}`;
      try {
        localStorage.setItem(key, sid);
      } catch {
        /* ignore */
      }
    }
    setSessionId(sid);
  }, []);

  async function run(attack: string) {
    if (!sessionId || busy) return;
    setBusy(true);
    setActive(attack);
    setResult(null);
    setTookMs(null);
    const t0 = performance.now();
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, attack }),
    });
    const data = (await res.json()) as LabResult;
    setTookMs(Math.round(performance.now() - t0));
    setResult(data);
    setBusy(false);
  }

  const statusLabel = result?.error
    ? "error"
    : result?.blocked != null
      ? result.blocked
        ? "blocked · fail-closed"
        : "unexpected · investigate"
      : busy
        ? "awaiting /api/lab…"
        : "idle — pick an attack";

  return (
    <main className="mx-auto max-w-[90rem] px-6 py-10 lg:px-10">
      <p className="text-sm text-muted">
        <Link href="/shop" className="hover:text-fg">
          ← Shop
        </Link>
        {" · "}
        <Link href="/audit" className="hover:text-fg">
          Audit
        </Link>
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-serif)] text-4xl">Gate lab</h1>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
        Each click is one real <span className="font-mono text-fg">POST /api/lab</span>. The terminal
        shows that response — no fake wait. Crypto checks are fast; that&apos;s why it feels instant.
        Session: <span className="font-mono text-sm text-fg">{sessionId || "…"}</span>
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          {ATTACKS.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={busy || !sessionId}
              onClick={() => void run(a.id)}
              className={`w-full border p-4 text-left transition-colors hover:border-fg disabled:opacity-40 ${
                active === a.id ? "border-fg bg-card" : "border-line bg-card"
              }`}
            >
              <p className="font-[family-name:var(--font-serif)] text-xl">{a.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                <span className="font-medium text-fg">Try: </span>
                {a.try}
              </p>
            </button>
          ))}
        </div>

        <div className="flex min-h-[28rem] flex-col border border-line bg-[#1a1816] text-[#e8e2d9] dark:bg-[#0f0e0c]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="size-2 rounded-full bg-white/25" />
            <span className="size-2 rounded-full bg-white/25" />
            <span className="size-2 rounded-full bg-white/25" />
            <p className="ml-2 font-mono text-xs text-white/50">gate-lab — detection</p>
            <p className="ml-auto font-mono text-xs uppercase text-white/45">{statusLabel}</p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed">
            {!result && !busy ? (
              <p className="text-white/40">
                $ waiting
                <br />
                # pick an attack — round-trip + server log print here
              </p>
            ) : null}

            {busy ? (
              <p className="text-white/50">
                $ POST /api/lab attack={active}
                <br />
                <span className="animate-pulse">█</span> awaiting response…
              </p>
            ) : null}

            {result?.error ? <p className="text-red-400">{result.error}</p> : null}

            {!busy && result?.log
              ? result.log.map((row, i) => (
                  <div key={`${row.t}-${i}`} className="mb-2 flex gap-3">
                    <span className="shrink-0 text-white/35">{row.t}</span>
                    <span
                      className={`w-12 shrink-0 ${
                        row.level === "block"
                          ? "text-red-400"
                          : row.level === "warn"
                            ? "text-orange-400"
                            : row.level === "pass"
                              ? "text-emerald-400/90"
                              : row.level === "try"
                                ? "text-white"
                                : "text-white/45"
                      }`}
                    >
                      {LEVEL[row.level] || row.level.toUpperCase()}
                    </span>
                    <span className="min-w-0 break-words text-white/85">{row.msg}</span>
                  </div>
                ))
              : null}

            {!busy && result && tookMs != null ? (
              <p className="mt-3 text-white/35">
                $ round-trip {tookMs}ms · {result.log?.length || 0} steps
              </p>
            ) : null}
          </div>

          {result && !busy && (result.auditReason || result.auditId) ? (
            <div className="border-t border-white/10 px-4 py-3 text-sm text-white/55">
              {result.auditReason ? (
                <p>
                  <span className="text-white/80">audit: </span>
                  {result.auditReason}
                </p>
              ) : null}
              <p className="mt-1 font-mono text-xs text-white/40">
                {result.auditId ? `${result.auditId} · ` : null}
                <Link href="/audit" className="underline hover:text-white/70">
                  open /audit
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
