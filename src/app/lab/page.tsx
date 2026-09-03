"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type LabLogLine = {
  t: string;
  level: "info" | "try" | "check" | "pass" | "block" | "warn" | "sys";
  msg: string;
};

type LabEvidence = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  highlightKeys?: string[];
  http?: {
    method: string;
    path: string;
    requestHeaders?: Record<string, string>;
    requestBody?: unknown;
    responseStatus: number;
    responseBody?: unknown;
  };
};

type LabResult = {
  attack?: string;
  blocked?: boolean;
  auditId?: string;
  auditReason?: string;
  sessionId?: string;
  log?: LabLogLine[];
  evidence?: LabEvidence;
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

const STEP_MS = 420;

function JsonPanel({
  title,
  data,
  highlightKeys = [],
}: {
  title: string;
  data: Record<string, unknown>;
  highlightKeys?: string[];
}) {
  const keys = Object.keys(data);
  return (
    <div className="min-w-0 flex-1 border border-white/10 bg-black/30 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-white/45">{title}</p>
      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed">
        {"{\n"}
        {keys.map((k, i) => {
          const hot = highlightKeys.includes(k);
          const val = JSON.stringify(data[k]);
          return (
            <span key={k} className={hot ? "text-red-400" : "text-white/75"}>
              {`  "${k}": ${val}`}
              {i < keys.length - 1 ? ",\n" : "\n"}
            </span>
          );
        })}
        {"}"}
      </pre>
    </div>
  );
}

export default function LabPage() {
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<LabResult | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [showEvidence, setShowEvidence] = useState(false);

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

  useEffect(() => {
    if (!result?.log?.length || busy) {
      setVisibleSteps(0);
      setShowEvidence(false);
      return;
    }
    setVisibleSteps(0);
    setShowEvidence(false);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setVisibleSteps(i);
      if (i >= (result.log?.length || 0)) {
        window.clearInterval(id);
        window.setTimeout(() => setShowEvidence(true), 200);
      }
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [result, busy]);

  const visibleLog = useMemo(() => (result?.log || []).slice(0, visibleSteps), [result, visibleSteps]);
  const streamingDone = Boolean(result?.log?.length && visibleSteps >= result.log.length);

  async function run(attack: string) {
    if (!sessionId || busy) return;
    setBusy(true);
    setActive(attack);
    setResult(null);
    setTookMs(null);
    setVisibleSteps(0);
    setShowEvidence(false);
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
    : busy
      ? "awaiting /api/lab…"
      : result?.blocked != null
        ? streamingDone
          ? result.blocked
            ? "blocked · fail-closed"
            : "unexpected · investigate"
          : "replaying detection…"
        : "idle — pick an attack";

  const auditHref =
    result?.auditId && (result.sessionId || sessionId)
      ? `/audit?tab=all&session=${encodeURIComponent(result.sessionId || sessionId)}&event=${encodeURIComponent(result.auditId)}`
      : "/audit";

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
        Each click is one real <span className="font-mono text-fg">POST /api/lab</span>. Steps stream
        from that response; before/after JSON and HTTP snippets are the proof — not a printed PASS.
        Session: <span className="font-mono text-sm text-fg">{sessionId || "…"}</span>
      </p>

      <div className="mt-8 flex items-start gap-8" style={{ flexWrap: "nowrap" }}>
        <div className="space-y-3" style={{ width: "40%", flexShrink: 0 }}>
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

        <div className="flex min-h-[32rem] flex-col border border-line bg-[#1a1816] text-[#e8e2d9] dark:bg-[#0f0e0c]" style={{ flex: 1, position: "sticky", top: "1.5rem" }}>
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="size-2 rounded-full bg-white/25" />
            <span className="size-2 rounded-full bg-white/25" />
            <span className="size-2 rounded-full bg-white/25" />
            <p className="ml-2 font-mono text-xs text-white/50">gate-lab — detection</p>
            <p className="ml-auto font-mono text-xs uppercase text-white/45">{statusLabel}</p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 font-mono text-[13px] leading-relaxed">
            {!result && !busy ? (
              <p className="text-white/40">
                $ waiting
                <br />
                # pick an attack — live round-trip, then stepped replay
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

            {visibleLog.map((row, i) => (
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
            ))}

            {!busy && result && !streamingDone ? (
              <p className="animate-pulse text-white/35">█</p>
            ) : null}

            {showEvidence && result?.evidence?.before && result?.evidence?.after ? (
              <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                <p className="text-[10px] uppercase tracking-wide text-white/45">
                  Evidence · before / after
                  {result.evidence.highlightKeys?.length
                    ? ` · red = ${result.evidence.highlightKeys.join(", ")}`
                    : ""}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <JsonPanel
                    title="before"
                    data={result.evidence.before}
                    highlightKeys={result.evidence.highlightKeys}
                  />
                  <JsonPanel
                    title="after"
                    data={result.evidence.after}
                    highlightKeys={result.evidence.highlightKeys}
                  />
                </div>
              </div>
            ) : null}

            {showEvidence && result?.evidence?.http ? (
              <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                <p className="text-[10px] uppercase tracking-wide text-white/45">
                  HTTP · {result.evidence.http.method} {result.evidence.http.path}
                </p>
                <div className="border border-white/10 bg-black/30 p-3 text-[11px]">
                  {result.evidence.http.requestHeaders ? (
                    <p className="mb-2 text-white/55">
                      headers: {JSON.stringify(result.evidence.http.requestHeaders)}
                    </p>
                  ) : null}
                  <p className="mb-1 text-white/45">request</p>
                  <pre className="mb-3 overflow-x-auto whitespace-pre-wrap text-white/80">
                    {JSON.stringify(result.evidence.http.requestBody, null, 2)}
                  </pre>
                  <p
                    className={`mb-1 ${
                      result.evidence.http.responseStatus >= 400 ? "text-red-400" : "text-emerald-400/90"
                    }`}
                  >
                    ← HTTP {result.evidence.http.responseStatus}
                  </p>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-white/80">
                    {JSON.stringify(result.evidence.http.responseBody, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}

            {!busy && streamingDone && tookMs != null ? (
              <p className="mt-3 text-white/35">
                $ server {tookMs}ms · replay {(result?.log?.length || 0) * STEP_MS}ms ·{" "}
                {result?.log?.length || 0} steps
              </p>
            ) : null}
          </div>

          {showEvidence && result && (result.auditReason || result.auditId) ? (
            <div className="space-y-3 border-t border-white/10 px-4 py-4">
              {result.auditReason ? (
                <p className="text-sm text-white/60">
                  <span className="text-white/85">audit: </span>
                  {result.auditReason}
                </p>
              ) : null}
              {result.auditId ? (
                <Link
                  href={auditHref}
                  className="inline-flex w-full items-center justify-center bg-fg px-4 py-3 text-center text-sm font-medium text-bg"
                >
                  Open this audit event → {result.auditId}
                </Link>
              ) : (
                <Link href="/audit" className="text-sm text-white/50 underline hover:text-white/80">
                  Open /audit
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="font-[family-name:var(--font-serif)] text-2xl">What&apos;s gated</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Same fail-closed path for shop chat and MCP — not a sticker count. The agent never holds
          Razorpay keys or invents Order amounts; money moves only through these checks.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Budget before cart",
              body: "Shopper sets a signed mandate. No budget → cart and checkout stay locked (UI + MCP).",
            },
            {
              title: "Ed25519 mandate",
              body: "Buyer authority signs remaining/max/expiry. Merchant verifies with the public key only — forged remaining fails closed.",
            },
            {
              title: "Catalog prices win",
              body: "Tools cannot pass amountPaise or unit prices. Server runs priceCart from stored SKUs.",
            },
            {
              title: "Keys stay server-side",
              body: "Razorpay key/secret and webhook HMAC never enter the LLM or MCP client context.",
            },
            {
              title: "Over cap → 403",
              body: "quote_checkout over remaining returns blocked + negotiate tips. No Razorpay Order.",
            },
            {
              title: "Capture once",
              body: "Webhook HMAC must match. Double capture / confirm on the same Order debits once; stop rule on decline.",
            },
            {
              title: "Hash-chained audit",
              body: "Every money action is explainable, bounded, and gated — linked SHA-256 trail on /audit.",
            },
            {
              title: "One rail, two surfaces",
              body: "Buyer agent chat and MCP tools hit the same cart, mandate, and checkout code paths.",
            },
            {
              title: "Attacks above prove it",
              body: "Each lab button is a live POST /api/lab — forge, replay, expire, underpay, bad HMAC, double capture.",
            },
          ].map((g) => (
            <li key={g.title} className="border border-line bg-card px-4 py-4">
              <p className="text-sm font-medium text-fg">{g.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{g.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
