"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type LabResult = {
  attack?: string;
  blocked?: boolean;
  message?: string;
  gate?: { ok: boolean; reason?: string; code?: string };
  verifyOk?: boolean;
};

export default function LabPage() {
  const [sessionId, setSessionId] = useState("");
  const [result, setResult] = useState<LabResult | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (!sessionId) return;
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, attack }),
    });
    const data = (await res.json()) as LabResult;
    setResult(data);
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-sm text-muted">
        <Link href="/shop" className="hover:text-fg">
          ← Shop
        </Link>
        {" · "}
        <Link href="/audit" className="hover:text-fg">
          Order log
        </Link>
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-serif)] text-4xl">Gate lab</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Prove the mandate signature and expiry are load-bearing — not decorative. Each attack must fail closed (no
        Razorpay Order). Same session as the shop: <span className="font-mono text-[11px] text-fg">{sessionId || "…"}</span>
      </p>

      <div className="mt-8 space-y-3">
        <LabButton
          disabled={busy || !sessionId}
          title="Forge remaining"
          body="Bump remainingPaise 10× without buyer re-sign. Merchant public-key verify must reject."
          onClick={() => void run("forge_remaining")}
        />
        <LabButton
          disabled={busy || !sessionId}
          title="Replay stale high-cap mandate"
          body="Lower the live cap, then try to use the old high remaining artifact. Session binds the live mandate only."
          onClick={() => void run("replay_stale")}
        />
        <LabButton
          disabled={busy || !sessionId}
          title="Expire mandate now"
          body="Buyer authority issues an already-expired mandate. Gate returns MANDATE_EXPIRED."
          onClick={() => void run("expire_now")}
        />
        <LabButton
          disabled={busy || !sessionId}
          title="Bad webhook signature"
          body="HMAC with the wrong secret — same check as POST /api/webhooks/razorpay."
          onClick={() => void run("bad_webhook")}
        />
      </div>

      {result ? (
        <div
          className={`mt-8 border p-4 ${
            result.blocked !== false ? "border-fg bg-card" : "border-danger/40 bg-danger/5"
          }`}
        >
          <p className="text-[11px] uppercase tracking-wide text-muted">{result.attack}</p>
          <p className="mt-2 text-sm leading-relaxed">{result.message}</p>
          {result.gate?.reason ? (
            <p className="mt-2 text-xs text-muted">{result.gate.reason}</p>
          ) : null}
          <p className="mt-3 text-xs text-muted">Check /audit for lab.* and mandate.verify_* events.</p>
        </div>
      ) : null}
    </main>
  );
}

function LabButton({
  title,
  body,
  onClick,
  disabled,
}: {
  title: string;
  body: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full border border-line bg-card p-4 text-left hover:border-fg disabled:opacity-40"
    >
      <p className="font-[family-name:var(--font-serif)] text-xl">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
    </button>
  );
}
