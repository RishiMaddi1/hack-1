import { createHmac } from "crypto";
import type { Mandate, Product } from "./types";

function secret() {
  return process.env.MANDATE_SECRET || "u402-dev-mandate-secret";
}

export function signMandate(payload: Omit<Mandate, "signature">): string {
  const body = JSON.stringify({
    id: payload.id,
    agentId: payload.agentId,
    merchantId: payload.merchantId,
    maxPaise: payload.maxPaise,
    remainingPaise: payload.remainingPaise,
    categories: payload.categories,
    expiresAt: payload.expiresAt,
  });
  return createHmac("sha256", secret()).update(body).digest("hex");
}

export function verifyMandate(mandate: Mandate): boolean {
  const { signature, ...rest } = mandate;
  return signMandate(rest) === signature;
}

export type GateResult =
  | { ok: true; reason: string }
  | { ok: false; code: "MANDATE_EXCEEDED" | "MANDATE_EXPIRED" | "MANDATE_CATEGORY"; reason: string };

export function gateCart(mandate: Mandate, products: Product[], payablePaise: number): GateResult {
  if (!verifyMandate(mandate)) {
    return { ok: false, code: "MANDATE_EXPIRED", reason: "Mandate signature failed verification." };
  }
  if (new Date(mandate.expiresAt).getTime() < Date.now()) {
    return { ok: false, code: "MANDATE_EXPIRED", reason: "Mandate expired. Human must re-authorise." };
  }
  if (mandate.categories !== "*") {
    const bad = products.find((p) => !mandate.categories.includes(p.category));
    if (bad) {
      return {
        ok: false,
        code: "MANDATE_CATEGORY",
        reason: `${bad.name} is category ${bad.category}, not allowed by this mandate.`,
      };
    }
  }
  if (payablePaise > mandate.remainingPaise) {
    return {
      ok: false,
      code: "MANDATE_EXCEEDED",
      reason: `Cart is ₹${(payablePaise / 100).toFixed(0)} but remaining mandate is ₹${(mandate.remainingPaise / 100).toFixed(0)}. No Razorpay Order was created.`,
    };
  }
  return {
    ok: true,
    reason: `Within remaining ₹${(mandate.remainingPaise / 100).toFixed(0)} of ₹${(mandate.maxPaise / 100).toFixed(0)} mandate ${mandate.id}.`,
  };
}
