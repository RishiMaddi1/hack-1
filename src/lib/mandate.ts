import { createPublicKey, verify } from "crypto";
import type { Mandate, Product } from "./types";
import { canonicalMandate, MANDATE_ALG, MANDATE_KID } from "./mandate-claims";
import { writeAudit } from "./audit";

/** Must match the public half of BUYER_MANDATE_PRIVATE_KEY_B64 / demo private key. */
const DEMO_PUBLIC_B64 = "MCowBQYDK2VwAyEAeUinDlLu+mMo68ZJxEEZ5BXBBWj+WhoDC7MiA5/7dJg=";

function publicKey() {
  const b64 = process.env.BUYER_MANDATE_PUBLIC_KEY_B64 || DEMO_PUBLIC_B64;
  return createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" });
}

/**
 * Merchant-side verify only. Does not hold or import the private key.
 */
export function verifyMandate(mandate: Mandate): boolean {
  try {
    const claims = {
      id: mandate.id,
      agentId: mandate.agentId,
      merchantId: mandate.merchantId,
      maxPaise: mandate.maxPaise,
      remainingPaise: mandate.remainingPaise,
      categories: mandate.categories,
      expiresAt: mandate.expiresAt,
      createdAt: mandate.createdAt,
    };
    return verify(
      null,
      Buffer.from(canonicalMandate(claims)),
      publicKey(),
      Buffer.from(mandate.signature, "base64"),
    );
  } catch {
    return false;
  }
}

export function auditMandateVerify(sessionId: string, mandate: Mandate, ok: boolean) {
  writeAudit({
    sessionId,
    type: ok ? "mandate.verify_ok" : "mandate.verify_fail",
    explainable: true,
    bounded: true,
    gated: true,
    reason: ok
      ? `Merchant verified mandate ${mandate.id} with public key (kid ${mandate.kid || MANDATE_KID}).`
      : `Merchant rejected mandate ${mandate.id}: signature verification failed. No Razorpay Order.`,
    data: { mandateId: mandate.id, alg: mandate.alg || MANDATE_ALG, kid: mandate.kid || MANDATE_KID },
  });
}

export type GateResult =
  | { ok: true; reason: string }
  | {
      ok: false;
      code: "MANDATE_EXCEEDED" | "MANDATE_EXPIRED" | "MANDATE_CATEGORY" | "MANDATE_BAD_SIGNATURE";
      reason: string;
    };

export function gateCart(
  mandate: Mandate,
  products: Product[],
  payablePaise: number,
  sessionId?: string,
): GateResult {
  const sigOk = verifyMandate(mandate);
  if (sessionId) auditMandateVerify(sessionId, mandate, sigOk);
  if (!sigOk) {
    return {
      ok: false,
      code: "MANDATE_BAD_SIGNATURE",
      reason: "Mandate signature failed verification. Buyer authority did not sign this claim. No Razorpay Order.",
    };
  }
  if (new Date(mandate.expiresAt).getTime() < Date.now()) {
    return {
      ok: false,
      code: "MANDATE_EXPIRED",
      reason: "Mandate expired. Human must re-authorise with the buyer signing authority.",
    };
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
