import type { Mandate } from "./types";

export const MANDATE_ALG = "Ed25519";
export const MANDATE_KID = "buyer-mandate-v1";

export type MandateClaims = Omit<Mandate, "signature" | "alg" | "kid">;

export function canonicalMandate(payload: MandateClaims): string {
  return JSON.stringify({
    id: payload.id,
    agentId: payload.agentId,
    merchantId: payload.merchantId,
    maxPaise: payload.maxPaise,
    remainingPaise: payload.remainingPaise,
    categories: payload.categories,
    expiresAt: payload.expiresAt,
    createdAt: payload.createdAt,
  });
}
