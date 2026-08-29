import { createPrivateKey, sign } from "crypto";
import type { Mandate } from "./types";
import { canonicalMandate, MANDATE_ALG, MANDATE_KID, type MandateClaims } from "./mandate-claims";

/** Demo keypair — replace via BUYER_MANDATE_*_B64 in .env for a fresh authority. */
const DEMO_PRIVATE_B64 = "MC4CAQAwBQYDK2VwBCIEIA0AEQFA28J/CfG++AOk7k4CN2+FqQeA4KRJPdwrFNOX";

export { MANDATE_ALG, MANDATE_KID, canonicalMandate, type MandateClaims };

function privateKey() {
  const b64 = process.env.BUYER_MANDATE_PRIVATE_KEY_B64 || DEMO_PRIVATE_B64;
  return createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
}

/**
 * Buyer-side signing authority only. Merchant gate must not import this for verify.
 */
export function signMandate(payload: MandateClaims): string {
  return sign(null, Buffer.from(canonicalMandate(payload)), privateKey()).toString("base64");
}

export function issueMandate(payload: MandateClaims): Mandate {
  return {
    ...payload,
    alg: MANDATE_ALG,
    kid: MANDATE_KID,
    signature: signMandate(payload),
  };
}
