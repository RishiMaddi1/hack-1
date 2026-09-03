"use client";

import { useCallback, useEffect, useState } from "react";

type Props = {
  shopperToken: string;
};

export function EmailReminders({ shopperToken }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopper-Token": shopperToken,
      },
      body: JSON.stringify({ action: "status" }),
    });
    const data = await res.json();
    if (res.ok && data.emailVerified && data.email) {
      setVerifiedEmail(data.email);
      setPending(false);
    } else if (data.pendingEmail) {
      setEmail(data.pendingEmail);
      setPending(true);
    }
  }, [shopperToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function requestOtp() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopper-Token": shopperToken,
        },
        body: JSON.stringify({ action: "request_otp", email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.message || data.error || "Send failed");
        return;
      }
      setPending(true);
      setMsg(data.message || "Code sent");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopper-Token": shopperToken,
        },
        body: JSON.stringify({ action: "verify_otp", code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.message || data.error || "Verify failed");
        return;
      }
      setVerifiedEmail(data.email);
      setPending(false);
      setMsg("Email verified — we’ll nudge you if you leave a cart.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (verifiedEmail) {
    return (
      <div className="mt-6 border-t border-line pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Cart reminders</p>
        <p className="mt-1 text-sm text-muted">
          On for <span className="text-fg">{verifiedEmail}</span>. Optional — agents never need this.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Cart reminders (optional)</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Verify email for abandoned-cart nudges with cheaper swaps. Skip anytime — shopping &amp; MCP
        still work.
      </p>
      {!pending ? (
        <div className="mt-3 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="min-w-0 flex-1 border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-fg"
          />
          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={() => void requestOtp()}
            className="shrink-0 border border-fg px-3 py-2 text-sm disabled:opacity-40"
          >
            {busy ? "…" : "Send code"}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">Code sent to {email}</p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              className="min-w-0 flex-1 border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-fg"
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={() => void verifyOtp()}
              className="shrink-0 bg-fg px-3 py-2 text-sm text-bg disabled:opacity-40"
            >
              {busy ? "…" : "Verify"}
            </button>
          </div>
          <button
            type="button"
            className="text-xs text-muted underline"
            onClick={() => void requestOtp()}
            disabled={busy}
          >
            Resend code
          </button>
        </div>
      )}
      {msg ? <p className="mt-2 text-xs text-muted">{msg}</p> : null}
      {err ? <p className="mt-2 text-xs text-danger">{err}</p> : null}
    </div>
  );
}
