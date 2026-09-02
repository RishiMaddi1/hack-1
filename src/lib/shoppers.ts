import { createHash, randomBytes } from "crypto";
import { writeAudit } from "./audit";
import { MERCHANT_ID } from "./catalog";
import { id } from "./ids";
import { issueMandate } from "./mandate-signer";
import { assertMerchant } from "./merchants";
import { getDb, saveDb, type SessionState } from "./store";
import type { Mandate, Shopper } from "./types";

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mintToken(): string {
  return `stk_${randomBytes(24).toString("base64url")}`;
}

/** Placeholder mandate — not spendable until set_budget. */
export function createEmptyMandate(sessionId: string, merchantId: string): Mandate {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return issueMandate({
    id: id("man"),
    agentId: `agt_${sessionId.slice(0, 8)}`,
    merchantId,
    maxPaise: 0,
    remainingPaise: 0,
    categories: "*",
    expiresAt,
    createdAt,
  });
}

export type RegisterResult =
  | {
      ok: true;
      username: string;
      shopperId: string;
      shopperToken: string;
      sessionId: string;
      merchantId: string;
    }
  | { ok: false; error: "USERNAME_INVALID" | "USERNAME_TAKEN"; message: string };

export function registerShopper(opts: {
  username: string;
  merchantId?: string;
}): RegisterResult {
  const username = normalizeUsername(opts.username);
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error: "USERNAME_INVALID",
      message: "Username must be 3–32 chars: lowercase letters, digits, underscore.",
    };
  }
  const merchant = assertMerchant(opts.merchantId);
  const db = getDb();
  if (Object.values(db.shoppers).some((s) => s.username === username)) {
    return {
      ok: false,
      error: "USERNAME_TAKEN",
      message: `Username “${username}” is taken. Pick another or login_shopper.`,
    };
  }

  const sessionId = id("ses");
  const shopperId = id("shp");
  const shopperToken = mintToken();
  const mandate = createEmptyMandate(sessionId, merchant.id);
  db.mandates[mandate.id] = mandate;
  const session: SessionState = {
    id: sessionId,
    cart: [],
    mandateId: mandate.id,
    declineAttempts: 0,
    shopperId,
    merchantId: merchant.id,
    budgetSet: false,
  };
  db.sessions[sessionId] = session;
  const shopper: Shopper = {
    id: shopperId,
    username,
    tokenHash: hashToken(shopperToken),
    sessionId,
    createdAt: new Date().toISOString(),
  };
  db.shoppers[shopperId] = shopper;
  saveDb();

  writeAudit({
    sessionId,
    type: "shopper.registered",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Shopper “${username}” registered on ${merchant.name}. Budget not set yet.`,
    data: { shopperId, username, merchantId: merchant.id },
  });

  return {
    ok: true,
    username,
    shopperId,
    shopperToken,
    sessionId,
    merchantId: merchant.id,
  };
}

export type AuthOk = {
  ok: true;
  shopper: Shopper;
  session: SessionState;
  username: string;
};

export type AuthFail = { ok: false; status: 401 | 403; error: string; message: string };

export function authenticateShopper(token: string | undefined | null): AuthOk | AuthFail {
  if (!token?.trim()) {
    return {
      ok: false,
      status: 401,
      error: "SHOPPER_REQUIRED",
      message: "Register or login first. Pass shopper_token (header X-Shopper-Token or body).",
    };
  }
  const tokenHash = hashToken(token.trim());
  const db = getDb();
  const shopper = Object.values(db.shoppers).find((s) => s.tokenHash === tokenHash);
  if (!shopper) {
    return {
      ok: false,
      status: 401,
      error: "SHOPPER_INVALID",
      message: "Unknown shopper_token.",
    };
  }
  const session = db.sessions[shopper.sessionId];
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: "SESSION_MISSING",
      message: "Shopper session missing — register again.",
    };
  }
  return { ok: true, shopper, session, username: shopper.username };
}

export function loginShopper(opts: {
  username: string;
  shopperToken: string;
}): AuthOk | AuthFail | { ok: false; status: 401; error: string; message: string } {
  const username = normalizeUsername(opts.username);
  const auth = authenticateShopper(opts.shopperToken);
  if (!auth.ok) return auth;
  if (auth.shopper.username !== username) {
    return {
      ok: false,
      status: 401,
      error: "USERNAME_MISMATCH",
      message: "Username does not match this shopper_token.",
    };
  }
  writeAudit({
    sessionId: auth.session.id,
    type: "shopper.login",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Shopper “${username}” logged in — cart and mandate restored.`,
    data: { shopperId: auth.shopper.id, username },
  });
  return auth;
}

export function requireBudget(session: SessionState): AuthFail | null {
  if (!session.budgetSet) {
    return {
      ok: false,
      status: 403,
      error: "BUDGET_REQUIRED",
      message: "Call set_budget before shopping (cart / checkout).",
    };
  }
  return null;
}

export function setShopperBudget(opts: {
  shopperToken: string;
  maxRupees: number;
}):
  | { ok: true; shopper: Shopper; session: SessionState; username: string; mandate: Mandate }
  | AuthFail {
  const auth = authenticateShopper(opts.shopperToken);
  if (!auth.ok) return auth;
  const maxPaise = Math.round(opts.maxRupees * 100);
  if (!Number.isFinite(maxPaise) || maxPaise < 100_00 || maxPaise > 500_000_00) {
    return {
      ok: false,
      status: 403,
      error: "BUDGET_INVALID",
      message: "Budget must be between ₹100 and ₹5,00,000.",
    };
  }
  const db = getDb();
  const mandate = db.mandates[auth.session.mandateId];
  if (!mandate) {
    return { ok: false, status: 401, error: "MANDATE_MISSING", message: "Mandate missing." };
  }
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const signed = issueMandate({
    id: mandate.id,
    agentId: mandate.agentId,
    merchantId: auth.session.merchantId || MERCHANT_ID,
    maxPaise,
    remainingPaise: maxPaise,
    categories: mandate.categories,
    expiresAt,
    createdAt: mandate.createdAt,
  });
  Object.assign(mandate, signed);
  auth.session.budgetSet = true;
  saveDb();
  writeAudit({
    sessionId: auth.session.id,
    type: "mandate.signed",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Shopper “${auth.username}” set budget ₹${maxPaise / 100} (full remaining).`,
    data: {
      shopperId: auth.shopper.id,
      username: auth.username,
      mandateId: mandate.id,
      maxPaise,
    },
  });
  return { ok: true, shopper: auth.shopper, session: auth.session, username: auth.username, mandate };
}

export function extractShopperToken(request: Request, body?: Record<string, unknown>): string | undefined {
  const header = request.headers.get("x-shopper-token") || request.headers.get("X-Shopper-Token");
  if (header?.trim()) return header.trim();
  if (typeof body?.shopperToken === "string") return body.shopperToken;
  if (typeof body?.shopper_token === "string") return body.shopper_token;
  return undefined;
}
