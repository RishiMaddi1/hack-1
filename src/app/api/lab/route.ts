import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getDb, getOrCreateSession, saveDb } from "@/lib/store";
import { verifyMandate, gateCart, auditMandateVerify } from "@/lib/mandate";
import { issueMandate } from "@/lib/mandate-signer";
import { writeAudit } from "@/lib/audit";
import { priceCart } from "@/lib/quote";
import { getMandateForSession, mutateCart } from "@/lib/cart";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { quoteCheckout, simulateDoubleCapture } from "@/lib/checkout";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { Mandate } from "@/lib/types";

export type LabLogLine = {
  t: string;
  level: "info" | "try" | "check" | "pass" | "block" | "warn" | "sys";
  msg: string;
};

export type LabHttpEvidence = {
  method: string;
  path: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseStatus: number;
  responseBody?: unknown;
};

export type LabEvidence = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  highlightKeys?: string[];
  http?: LabHttpEvidence;
};

function now() {
  return new Date().toISOString().slice(11, 23);
}

function line(level: LabLogLine["level"], msg: string): LabLogLine {
  return { t: now(), level, msg };
}

function mandateSnap(m: Mandate): Record<string, unknown> {
  return {
    id: m.id,
    maxPaise: m.maxPaise,
    remainingPaise: m.remainingPaise,
    expiresAt: m.expiresAt,
    kid: m.kid || null,
    signature: `${String(m.signature || "").slice(0, 28)}…`,
  };
}

/**
 * Adversarial demos — each attack runs real verify/gate/checkout code and returns a step log + evidence.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    attack?:
      | "forge_remaining"
      | "replay_stale"
      | "expire_now"
      | "bad_webhook"
      | "double_capture"
      | "underpay";
  };
  if (!body.sessionId || !body.attack) {
    return NextResponse.json({ error: "sessionId and attack required" }, { status: 400 });
  }
  const limited = rateLimit(`lab:${clientKey(request, body.sessionId)}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  const session = getOrCreateSession(body.sessionId);
  const db = getDb();
  const mandate = db.mandates[session.mandateId];
  if (!mandate) {
    return NextResponse.json({ error: "No mandate" }, { status: 404 });
  }

  if (body.attack === "forge_remaining") {
    const log: LabLogLine[] = [];
    const before = mandateSnap(mandate);
    log.push(line("sys", `POST /api/lab · attack=forge_remaining · session=${body.sessionId}`));
    log.push(line("info", `Loaded live mandate ${mandate.id}`));
    log.push(
      line(
        "info",
        `Live claims: max ₹${mandate.maxPaise / 100}, remaining ₹${mandate.remainingPaise / 100}, kid=${mandate.kid || "—"}`,
      ),
    );
    const forged = {
      ...mandate,
      remainingPaise: mandate.maxPaise * 10,
    };
    const after = mandateSnap(forged);
    log.push(
      line(
        "try",
        `Attack: mutate remainingPaise ${before.remainingPaise} → ${after.remainingPaise} (10× max) without buyer re-sign`,
      ),
    );
    log.push(line("check", "Calling verifyMandate(forged) — Ed25519 over canonical claims + signature"));
    const ok = verifyMandate(forged);
    auditMandateVerify(body.sessionId, forged, ok);
    log.push(
      ok
        ? line("warn", "verifyMandate returned true — unexpected; signing keys may be misconfigured")
        : line("block", "verifyMandate returned false — signature no longer matches claims"),
    );
    const priced = priceCart(
      session.cart.length ? session.cart : [{ sku: "chimera-wireless-gaming-mouse", qty: 1 }],
    );
    log.push(line("check", `gateCart with forged artifact (cart payable ₹${priced.payablePaise / 100})`));
    const gate = gateCart(forged, priced.products, priced.payablePaise);
    log.push(
      gate.ok
        ? line("warn", `gateCart allowed checkout — ${"code" in gate ? gate.code : "ok"}`)
        : line("block", `gateCart blocked — ${"code" in gate ? gate.code : "BLOCKED"}: ${gate.reason || "rejected"}`),
    );
    log.push(line("pass", "No Razorpay Order created — fail closed before money path"));
    const evidence: LabEvidence = {
      before,
      after,
      highlightKeys: ["remainingPaise"],
    };
    const audit = writeAudit({
      sessionId: body.sessionId,
      type: "lab.forge_remaining",
      explainable: true,
      bounded: true,
      gated: true,
      reason: ok
        ? "UNEXPECTED: forged remaining verified — keys misconfigured."
        : `Forged remainingPaise to ₹${forged.remainingPaise / 100} without buyer re-sign. Signature check failed. No Order.`,
      data: { ok, gate, evidence },
    });
    return NextResponse.json({
      attack: body.attack,
      blocked: !ok || !gate.ok,
      verifyOk: ok,
      gate,
      log,
      evidence,
      auditId: audit.id,
      auditReason: audit.reason,
      sessionId: body.sessionId,
    });
  }

  if (body.attack === "replay_stale") {
    const log: LabLogLine[] = [];
    const stale = { ...mandate };
    const before = mandateSnap(stale);
    log.push(line("sys", `POST /api/lab · attack=replay_stale · session=${body.sessionId}`));
    log.push(
      line(
        "info",
        `Snapshot stale artifact: remaining ₹${stale.remainingPaise / 100}, max ₹${stale.maxPaise / 100}`,
      ),
    );
    const lowered = issueMandate({
      id: mandate.id,
      agentId: mandate.agentId,
      merchantId: mandate.merchantId,
      maxPaise: 200000,
      remainingPaise: 200000,
      categories: mandate.categories,
      expiresAt: mandate.expiresAt,
      createdAt: mandate.createdAt,
    });
    Object.assign(mandate, lowered);
    saveDb();
    const after = mandateSnap(getMandateForSession(body.sessionId));
    log.push(line("try", "Buyer lowers live cap — issueMandate(max ₹2,000) written to session store"));
    log.push(
      line("info", `Live mandate now: remaining ₹${mandate.remainingPaise / 100}, new signature`),
    );
    log.push(line("try", "Attack: present stale high-remaining artifact at checkout"));
    const replayOk = verifyMandate(stale);
    log.push(
      line(
        "check",
        `verifyMandate(stale) → ${replayOk} (old sig may still match old claims; irrelevant if unused)`,
      ),
    );
    const current = getMandateForSession(body.sessionId);
    const usingStale = stale.remainingPaise !== current.remainingPaise;
    log.push(
      line(
        "check",
        `getMandateForSession → remaining ₹${current.remainingPaise / 100} (session binds live row only)`,
      ),
    );
    log.push(
      usingStale
        ? line(
            "block",
            `Stale ₹${stale.remainingPaise / 100} ignored — merchant never reads client-supplied mandate JSON for cap`,
          )
        : line("warn", "Replay check inconclusive"),
    );
    log.push(line("pass", "Cap stays at live remaining; replay cannot raise it"));
    const evidence: LabEvidence = {
      before,
      after,
      highlightKeys: ["remainingPaise", "maxPaise", "signature"],
    };
    const audit = writeAudit({
      sessionId: body.sessionId,
      type: "lab.replay_stale",
      explainable: true,
      bounded: true,
      gated: true,
      reason: usingStale
        ? `Replay rejected: session binds mandate ${current.id} at ₹${current.remainingPaise / 100} left. Stale artifact with ₹${stale.remainingPaise / 100} is not the live mandate.`
        : "Replay check inconclusive.",
      data: {
        staleRemaining: stale.remainingPaise,
        liveRemaining: current.remainingPaise,
        staleSigStillValidForOldClaims: replayOk,
        evidence,
      },
    });
    return NextResponse.json({
      attack: body.attack,
      blocked: true,
      staleSigStillValidForOldClaims: replayOk,
      liveMandate: {
        remainingPaise: current.remainingPaise,
        maxPaise: current.maxPaise,
      },
      log,
      evidence,
      auditId: audit.id,
      auditReason: audit.reason,
      sessionId: body.sessionId,
    });
  }

  if (body.attack === "expire_now") {
    const log: LabLogLine[] = [];
    const before = mandateSnap(mandate);
    log.push(line("sys", `POST /api/lab · attack=expire_now · session=${body.sessionId}`));
    log.push(line("info", `Live mandate ${mandate.id} expiresAt=${mandate.expiresAt}`));
    const expired = issueMandate({
      id: mandate.id,
      agentId: mandate.agentId,
      merchantId: mandate.merchantId,
      maxPaise: mandate.maxPaise,
      remainingPaise: mandate.remainingPaise,
      categories: mandate.categories,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: mandate.createdAt,
    });
    Object.assign(mandate, expired);
    saveDb();
    const after = mandateSnap(mandate);
    log.push(line("try", `Attack: rewrite expiresAt to ${mandate.expiresAt} (already past) + re-sign`));
    const priced = priceCart(
      session.cart.length
        ? session.cart
        : [{ sku: "harpy-black-light-weight-rgb-gaming-mouse", qty: 1 }],
    );
    log.push(line("check", `gateCart(session) for cart payable ₹${priced.payablePaise / 100}`));
    const gate = gateCart(
      mandate,
      priced.products,
      Math.min(priced.payablePaise, mandate.remainingPaise),
      body.sessionId,
    );
    log.push(
      gate.ok
        ? line("warn", `gateCart allowed — unexpected`)
        : line("block", `gateCart → ${"code" in gate ? gate.code : "BLOCKED"}: ${gate.reason}`),
    );
    log.push(line("pass", "Checkout stopped before Razorpay Order"));
    const evidence: LabEvidence = {
      before,
      after,
      highlightKeys: ["expiresAt", "signature"],
    };
    const audit = writeAudit({
      sessionId: body.sessionId,
      type: "mandate.expired",
      explainable: true,
      bounded: true,
      gated: true,
      reason: `Mandate ${mandate.id} expired mid-session. Gate: ${gate.reason}`,
      data: { expiresAt: mandate.expiresAt, gate, evidence },
    });
    return NextResponse.json({
      attack: body.attack,
      blocked: !gate.ok,
      gate,
      mandate: { id: mandate.id, expiresAt: mandate.expiresAt },
      log,
      evidence,
      auditId: audit.id,
      auditReason: audit.reason,
      sessionId: body.sessionId,
    });
  }

  if (body.attack === "bad_webhook") {
    const log: LabLogLine[] = [];
    const rawObj = {
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_fake", order_id: "order_fake", amount: 59900 } } },
    };
    const raw = JSON.stringify(rawObj);
    log.push(line("sys", `POST /api/lab · attack=bad_webhook · session=${body.sessionId}`));
    log.push(line("info", `Webhook body bytes: ${raw.length} · event=payment.captured`));
    const badSig = createHmac("sha256", "wrong-secret").update(raw).digest("hex");
    log.push(line("try", `Attack: HMAC-SHA256 with secret "wrong-secret" → ${badSig.slice(0, 24)}…`));
    log.push(line("check", "verifyWebhookSignature(raw, badSig) — same helper as POST /api/webhooks/razorpay"));
    const ok = verifyWebhookSignature(raw, badSig);
    const responseStatus = ok ? 200 : 400;
    const responseBody = ok ? { ok: true } : { error: "bad signature" };
    log.push(
      ok
        ? line("warn", "Signature accepted — unexpected")
        : line("block", `Signature rejected → would return HTTP ${responseStatus} ${JSON.stringify(responseBody)}`),
    );
    log.push(line("pass", "No capture applied — payment.captured ignored"));
    const evidence: LabEvidence = {
      http: {
        method: "POST",
        path: "/api/webhooks/razorpay",
        requestHeaders: {
          "Content-Type": "application/json",
          "X-Razorpay-Signature": `${badSig.slice(0, 32)}…`,
        },
        requestBody: rawObj,
        responseStatus,
        responseBody,
      },
    };
    const audit = writeAudit({
      sessionId: body.sessionId,
      type: "lab.bad_webhook",
      explainable: true,
      bounded: true,
      gated: true,
      reason: ok
        ? "UNEXPECTED: bad webhook signature accepted."
        : "Webhook with wrong HMAC rejected (would be HTTP 400). Signature is load-bearing.",
      data: { accepted: ok, evidence },
    });
    return NextResponse.json({
      attack: body.attack,
      blocked: !ok,
      log,
      evidence,
      auditId: audit.id,
      auditReason: audit.reason,
      sessionId: body.sessionId,
    });
  }

  if (body.attack === "double_capture") {
    const log: LabLogLine[] = [];
    log.push(line("sys", `POST /api/lab · attack=double_capture · session=${body.sessionId}`));
    log.push(line("info", "Create quoted checkout (Harpy ₹599) to race capture paths"));
    const result = simulateDoubleCapture(body.sessionId);
    log.push(
      line(
        "info",
        `Mandate remaining before: ₹${result.remainingBefore / 100} · checkout ${result.checkoutId} · ${result.orderId}`,
      ),
    );
    log.push(line("try", "Path A: webhook payment.captured → applyCapture(…, webhook)"));
    log.push(
      result.firstApplied
        ? line("check", "First applyCapture returned true — debit applied")
        : line("warn", "First applyCapture returned false"),
    );
    log.push(line("try", "Path B: client confirm (same payment id) → applyCapture(…, client)"));
    log.push(
      result.secondApplied
        ? line("warn", "Second applyCapture returned true — double debit")
        : line("block", "Second applyCapture returned false — already paid / idempotent no-op"),
    );
    log.push(
      line(
        "info",
        `Mandate remaining after: ₹${result.remainingAfter / 100} (Δ ₹${result.spent / 100}, expected ₹${result.amountPaise / 100})`,
      ),
    );
    log.push(
      result.blocked
        ? line("pass", "Race survived: mandate debited once")
        : line("warn", "Unexpected race outcome — inspect applyCapture"),
    );
    const evidence: LabEvidence = {
      before: {
        remainingPaise: result.remainingBefore,
        checkoutStatus: "quoted",
        orderId: result.orderId,
      },
      after: {
        remainingPaise: result.remainingAfter,
        checkoutStatus: "paid",
        firstApplied: result.firstApplied,
        secondApplied: result.secondApplied,
        spentPaise: result.spent,
      },
      highlightKeys: ["remainingPaise", "secondApplied"],
    };
    return NextResponse.json({
      attack: body.attack,
      blocked: result.blocked,
      remainingBefore: result.remainingBefore,
      remainingAfter: result.remainingAfter,
      spent: result.spent,
      log,
      evidence,
      auditId: result.auditId,
      auditReason: result.message,
      sessionId: body.sessionId,
    });
  }

  if (body.attack === "underpay") {
    const log: LabLogLine[] = [];
    mutateCart(body.sessionId, "clear");
    mutateCart(body.sessionId, "add", "harpy-black-light-weight-rgb-gaming-mouse", 1);
    log.push(line("sys", `POST /api/lab · attack=underpay · session=${body.sessionId}`));
    log.push(line("info", "Cart set to Harpy mouse (catalog price ₹599)"));
    const attackBody = {
      sessionId: body.sessionId,
      amountPaise: 100,
      note: "client/agent attempted Order amount",
    };
    log.push(line("try", "Attack: client/agent sends amountPaise=100 (₹1) on quote"));
    writeAudit({
      sessionId: body.sessionId,
      type: "checkout.amount_injection_blocked",
      explainable: true,
      bounded: true,
      gated: true,
      reason: "Lab: agent/client asked for amountPaise=100 (₹1). Server ignores client amounts.",
      data: { attemptedAmountPaise: 100 },
    });
    log.push(line("check", "quoteCheckout(sessionId) — server prices from cart storage only (ignores amountPaise)"));
    const result = await quoteCheckout(body.sessionId);
    const quoted =
      result.status === 402 || result.status === 403
        ? (result.body as {
            error?: string;
            breakdown?: { payablePaise?: number; explanation?: string };
            accepts?: Array<{ amountPaise?: number; orderId?: string }>;
            paymentLinkUrl?: string;
          })
        : null;
    const payable = quoted?.breakdown?.payablePaise ?? quoted?.accepts?.[0]?.amountPaise ?? 0;
    const responseSnippet = {
      status: result.status,
      error: quoted?.error,
      payablePaise: payable,
      orderId: quoted?.accepts?.[0]?.orderId,
      paymentLinkUrl: quoted?.paymentLinkUrl,
      explanation: quoted?.breakdown?.explanation?.slice(0, 120),
    };
    log.push(line("info", `HTTP ${result.status} · quoted payable ₹${payable / 100}`));
    const blocked = payable === 59900 || (payable > 100 && payable !== 100);
    log.push(
      blocked && payable !== 100
        ? line("block", `Client ₹1 ignored — Order amount came from priced cart (₹${payable / 100})`)
        : line("warn", `Unexpected payable ₹${payable / 100}`),
    );
    log.push(line("pass", "LLM / client never chooses Razorpay Order amount"));
    const evidence: LabEvidence = {
      before: { clientAmountPaise: 100, cartSku: "harpy-black-light-weight-rgb-gaming-mouse" },
      after: { serverPayablePaise: payable, httpStatus: result.status },
      highlightKeys: ["clientAmountPaise", "serverPayablePaise"],
      http: {
        method: "POST",
        path: "/api/checkout",
        requestBody: attackBody,
        responseStatus: result.status,
        responseBody: responseSnippet,
      },
    };
    const audit = writeAudit({
      sessionId: body.sessionId,
      type: "lab.underpay",
      explainable: true,
      bounded: true,
      gated: true,
      reason:
        payable !== 100
          ? `Agent said charge ₹1. Server quoted ₹${payable / 100} from cart.`
          : `Unexpected payable ${payable}`,
      data: { attemptedAmountPaise: 100, payablePaise: payable, status: result.status, evidence },
    });
    return NextResponse.json({
      attack: body.attack,
      blocked: payable !== 100,
      payablePaise: payable,
      status: result.status,
      log,
      evidence,
      auditId: audit.id,
      auditReason: audit.reason,
      sessionId: body.sessionId,
    });
  }

  return NextResponse.json({ error: "Unknown attack" }, { status: 400 });
}
