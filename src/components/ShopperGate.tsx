"use client";

import { useEffect, useState } from "react";

const LS_TOKEN = "u402_shopper_token";
const LS_USER = "u402_shopper_username";
const LS_SESSION = "u402_session";

export type ShopperAuth = {
  username: string;
  shopperToken: string;
  sessionId: string;
  budgetSet: boolean;
};

export function readStoredShopper(): { username: string; token: string } | null {
  if (typeof window === "undefined") return null;
  const username = localStorage.getItem(LS_USER);
  const token = localStorage.getItem(LS_TOKEN);
  if (username && token) return { username, token };
  return null;
}

export function persistShopper(username: string, token: string, sessionId: string) {
  localStorage.setItem(LS_USER, username);
  localStorage.setItem(LS_TOKEN, token);
  localStorage.setItem(LS_SESSION, sessionId);
}

export function clearStoredShopper() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_SESSION);
}

export function readStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_SESSION);
}

type Props = {
  onReady: (auth: ShopperAuth) => void;
  resume?: ShopperAuth | null;
  initialMode?: "register" | "login";
};

export function ShopperGate({ onReady, resume, initialMode = "register" }: Props) {
  const [mode, setMode] = useState<"register" | "login">(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);
  const [username, setUsername] = useState(resume?.username || "");
  const [token, setToken] = useState(resume?.shopperToken || "");
  const [maxRupeesInput, setMaxRupeesInput] = useState("8000");
  const [step, setStep] = useState<"identity" | "budget">(resume ? "budget" : "identity");
  const [pending, setPending] = useState<ShopperAuth | null>(resume || null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shownToken, setShownToken] = useState<string | null>(null);
  const [shownUsername, setShownUsername] = useState<string | null>(null);
  const [copied, setCopied] = useState<"both" | "user" | "token" | null>(null);
  /** Optional cart-reminder email — never blocks mandate / MCP */
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [emailVerified, setEmailVerified] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  async function copyText(kind: "both" | "user" | "token", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  async function finishIdentity() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        const res = await fetch("/api/shoppers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "register", username }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.message || data.error || "Register failed");
          return;
        }
        persistShopper(data.username, data.shopperToken, data.sessionId);
        setShownToken(data.shopperToken);
        setShownUsername(data.username);
        setPending({
          username: data.username,
          shopperToken: data.shopperToken,
          sessionId: data.sessionId,
          budgetSet: false,
        });
        setStep("budget");
      } else {
        const res = await fetch("/api/shoppers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "login", username, shopperToken: token }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.message || data.error || "Login failed");
          return;
        }
        persistShopper(data.username, token, data.sessionId);
        if (data.budgetSet) {
          onReady({
            username: data.username,
            shopperToken: token,
            sessionId: data.sessionId,
            budgetSet: true,
          });
        } else {
          setPending({
            username: data.username,
            shopperToken: token,
            sessionId: data.sessionId,
            budgetSet: false,
          });
          setStep("budget");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function requestEmailOtp() {
    if (!pending?.shopperToken || !email.trim()) return;
    setBusy(true);
    setError(null);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopper-Token": pending.shopperToken,
        },
        body: JSON.stringify({ action: "request_otp", email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Could not send code");
        return;
      }
      setEmailPending(true);
      setEmailMsg(data.message || "Code sent — check your inbox.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmailOtp() {
    if (!pending?.shopperToken || otpCode.length !== 6) return;
    setBusy(true);
    setError(null);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopper-Token": pending.shopperToken,
        },
        body: JSON.stringify({ action: "verify_otp", code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Verify failed");
        return;
      }
      setEmailVerified(data.email);
      setEmailPending(false);
      setEmailMsg("Email verified — we’ll nudge you if you leave a cart.");
      setOtpCode("");
    } finally {
      setBusy(false);
    }
  }

  async function finishBudget() {
    if (!pending) return;
    const maxRupees = Number(maxRupeesInput);
    if (!maxRupeesInput.trim() || !Number.isFinite(maxRupees) || maxRupees < 100) {
      setError("Enter a budget of at least ₹100.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shoppers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopper-Token": pending.shopperToken,
        },
        body: JSON.stringify({ action: "set_budget", maxRupees }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || data.error || "Budget failed");
        return;
      }
      onReady({ ...pending, budgetSet: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/55 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto border border-line bg-card p-6 text-fg shadow-none">
        <p className="font-[family-name:var(--font-serif)] text-2xl tracking-tight text-fg">Circuit</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {step === "identity"
            ? "Register a unique username before shopping. AI agents use the same identity on MCP."
            : "Set your spend budget before the cart unlocks. Email for cart reminders is optional — skip anytime."}
        </p>

        {step === "identity" ? (
          <div className="mt-5 space-y-3">
            <div className="flex gap-3 text-xs font-medium">
              <button
                type="button"
                className={mode === "register" ? "text-fg underline" : "text-muted"}
                onClick={() => setMode("register")}
              >
                Register
              </button>
              <button
                type="button"
                className={mode === "login" ? "text-fg underline" : "text-muted"}
                onClick={() => setMode("login")}
              >
                Login
              </button>
            </div>
            <label className="block text-xs font-medium text-muted">
              Username
              <input
                className="mt-1 w-full border border-line bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-muted/60 outline-none focus:border-accent"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="rishi"
                autoComplete="username"
              />
            </label>
            {mode === "login" && (
              <label className="block text-xs font-medium text-muted">
                Shopper token
                <input
                  className="mt-1 w-full border border-line bg-bg px-3 py-2.5 font-mono text-xs text-fg placeholder:text-muted/60 outline-none focus:border-accent"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="stk_…"
                />
                <span className="mt-1 block text-[11px] leading-relaxed text-muted">
                  You need both username and token from registration — not your Razorpay key.
                </span>
              </label>
            )}
            <button
              type="button"
              disabled={busy || !username.trim() || (mode === "login" && !token.trim())}
              onClick={() => void finishIdentity()}
              className="w-full bg-fg px-3 py-2.5 text-sm font-medium text-bg disabled:opacity-40"
            >
              {busy ? "…" : mode === "register" ? "Create shopper" : "Continue"}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {shownToken && shownUsername ? (
              <div className="border border-accent/30 bg-accent/5 p-3">
                <p className="text-sm font-medium text-fg">Save these — you need both to log in again</p>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Username + shopper token. We cannot recover the token if you lose it.
                </p>
                <dl className="mt-3 space-y-2 text-xs">
                  <div>
                    <dt className="font-medium text-muted">Username</dt>
                    <dd className="mt-0.5 font-mono text-fg">{shownUsername}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Shopper token</dt>
                    <dd className="mt-0.5 break-all font-mono text-[10px] leading-relaxed text-fg">
                      {shownToken}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        "both",
                        `Username: ${shownUsername}\nShopper token: ${shownToken}`,
                      )
                    }
                    className="border border-fg px-3 py-1.5 text-xs text-fg hover:bg-fg hover:text-bg"
                  >
                    {copied === "both" ? "Copied" : "Copy both"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText("user", shownUsername)}
                    className="border border-line px-3 py-1.5 text-xs text-muted hover:border-fg hover:text-fg"
                  >
                    {copied === "user" ? "Copied" : "Copy username"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText("token", shownToken)}
                    className="border border-line px-3 py-1.5 text-xs text-muted hover:border-fg hover:text-fg"
                  >
                    {copied === "token" ? "Copied" : "Copy token"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="border border-line p-3">
              <p className="text-xs font-medium text-fg">Email for cart reminders (optional)</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Verify to get a receipt-style nudge with cheaper swaps if you abandon a cart. Agents never need this.
              </p>
              {emailVerified ? (
                <p className="mt-2 text-sm text-muted">
                  On for <span className="text-fg">{emailVerified}</span>
                </p>
              ) : !emailPending ? (
                <div className="mt-2 flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="min-w-0 flex-1 border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                    autoComplete="email"
                  />
                  <button
                    type="button"
                    disabled={busy || !email.trim() || !pending}
                    onClick={() => void requestEmailOtp()}
                    className="shrink-0 border border-fg px-3 py-2 text-xs disabled:opacity-40"
                  >
                    Send code
                  </button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] text-muted">Code sent to {email}</p>
                  <div className="flex gap-2">
                    <input
                      inputMode="numeric"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code"
                      className="min-w-0 flex-1 border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      disabled={busy || otpCode.length !== 6}
                      onClick={() => void verifyEmailOtp()}
                      className="shrink-0 border border-fg px-3 py-2 text-xs disabled:opacity-40"
                    >
                      Verify
                    </button>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] text-muted underline"
                    disabled={busy}
                    onClick={() => void requestEmailOtp()}
                  >
                    Resend code
                  </button>
                </div>
              )}
              {emailMsg ? <p className="mt-2 text-[11px] text-muted">{emailMsg}</p> : null}
            </div>

            <label className="block text-xs font-medium text-muted">
              Max budget (₹)
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="mt-1 w-full border border-line bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-accent"
                value={maxRupeesInput}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "");
                  setMaxRupeesInput(next);
                }}
                placeholder="8000"
              />
            </label>
            <button
              type="button"
              disabled={busy || !maxRupeesInput.trim()}
              onClick={() => void finishBudget()}
              className="w-full bg-fg px-3 py-2.5 text-sm font-medium text-bg disabled:opacity-40"
            >
              {busy ? "…" : emailVerified ? "Sign spend mandate" : "Skip email · sign spend mandate"}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
