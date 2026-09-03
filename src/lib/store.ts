import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type {
  AuditEvent,
  Campaign,
  CheckoutRecord,
  GrowthRow,
  Mandate,
  CartLine,
  MerchantRecord,
  Shopper,
  U402Quote,
} from "./types";
import { MERCHANT_ID, MERCHANT_NAME } from "./catalog";
import { id } from "./ids";
import { issueMandate } from "./mandate-signer";

export type SessionSuggestItem = { sku: string; name: string };

export type SessionState = {
  id: string;
  cart: CartLine[];
  mandateId: string;
  lastCheckoutId?: string;
  lastQuote?: U402Quote;
  declineAttempts: number;
  acceptedUpsell?: boolean;
  shopperId?: string;
  merchantId?: string;
  /** True only after set_budget / mandate sign with spendable cap */
  budgetSet?: boolean;
  /** Last cart mutation — for abandoned-cart cron */
  cartTouchedAt?: string;
  /** Last cards shown in buyer agent — for “add the 2nd / that one”. */
  lastSuggest?: {
    products: SessionSuggestItem[];
    upsell?: SessionSuggestItem;
    crossSell: SessionSuggestItem[];
    at: string;
  };
};

const STORE_SCHEMA = "circuit-kreo-v3";

export type Db = {
  schema: string;
  sessions: Record<string, SessionState>;
  mandates: Record<string, Mandate>;
  shoppers: Record<string, Shopper>;
  merchants: Record<string, MerchantRecord>;
  campaigns: Campaign[];
  audit: AuditEvent[];
  checkouts: Record<string, CheckoutRecord>;
  growth: GrowthRow[];
};

/** Local: ./data. Azure App Service: set DATA_DIR=/home/data for persistent storage. */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "runtime.json");

const globalStore = globalThis as unknown as { __u402?: Db };

function seedCampaigns(): Campaign[] {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return [
    {
      id: "cmp_tkl_week",
      name: "TKL week 10%",
      percentOff: 10,
      categories: ["keyboard"],
      skus: [],
      budgetPaise: 2000000,
      spentPaise: 249900,
      startsAt: now.toISOString(),
      endsAt: end.toISOString(),
      active: true,
    },
  ];
}

function seedGrowth(): GrowthRow[] {
  return [
    { id: "g1", withUpsell: false, aovPaise: 129900, recovered: true, source: "seed" },
    { id: "g2", withUpsell: false, aovPaise: 149900, recovered: true, source: "seed" },
    { id: "g3", withUpsell: false, aovPaise: 249900, recovered: true, source: "seed" },
    { id: "g4", withUpsell: false, aovPaise: 189900, recovered: true, source: "seed" },
    { id: "g5", withUpsell: false, aovPaise: 349900, recovered: true, source: "seed" },
    { id: "g6", withUpsell: true, aovPaise: 279800, recovered: true, source: "seed" },
    { id: "g7", withUpsell: true, aovPaise: 339800, recovered: true, source: "seed" },
    { id: "g8", withUpsell: true, aovPaise: 449800, recovered: true, source: "seed" },
    { id: "g9", withUpsell: true, aovPaise: 229800, recovered: true, source: "seed" },
    { id: "g10", withUpsell: true, aovPaise: 399800, recovered: true, source: "seed" },
  ];
}

function seedMerchants(): Record<string, MerchantRecord> {
  return {
    [MERCHANT_ID]: {
      id: MERCHANT_ID,
      name: MERCHANT_NAME,
      mcpPath: "/api/mcp",
      catalogPath: "/api/catalog",
    },
  };
}

function emptyDb(): Db {
  return {
    schema: STORE_SCHEMA,
    sessions: {},
    mandates: {},
    shoppers: {},
    merchants: seedMerchants(),
    campaigns: seedCampaigns(),
    audit: [],
    checkouts: {},
    growth: seedGrowth(),
  };
}

function migrate(parsed: Record<string, unknown>): Db {
  const base = emptyDb();
  if (parsed.sessions && typeof parsed.sessions === "object") {
    base.sessions = parsed.sessions as Db["sessions"];
  }
  if (parsed.mandates && typeof parsed.mandates === "object") {
    base.mandates = parsed.mandates as Db["mandates"];
  }
  if (parsed.campaigns && Array.isArray(parsed.campaigns)) {
    base.campaigns = parsed.campaigns as Campaign[];
  }
  if (parsed.audit && Array.isArray(parsed.audit)) {
    base.audit = parsed.audit as AuditEvent[];
  }
  if (parsed.checkouts && typeof parsed.checkouts === "object") {
    base.checkouts = parsed.checkouts as Db["checkouts"];
  }
  if (parsed.growth && Array.isArray(parsed.growth)) {
    base.growth = parsed.growth as GrowthRow[];
  }
  if (parsed.shoppers && typeof parsed.shoppers === "object") {
    base.shoppers = parsed.shoppers as Db["shoppers"];
  }
  if (parsed.merchants && typeof parsed.merchants === "object") {
    base.merchants = { ...seedMerchants(), ...(parsed.merchants as Db["merchants"]) };
  }
  // Legacy sessions without budgetSet: treat existing spendable mandates as budget set
  for (const s of Object.values(base.sessions)) {
    if (s.budgetSet === undefined) {
      const m = base.mandates[s.mandateId];
      s.budgetSet = Boolean(m && m.maxPaise > 0);
      s.merchantId = s.merchantId || MERCHANT_ID;
    }
  }
  base.schema = STORE_SCHEMA;
  return base;
}

function load(): Db {
  if (globalStore.__u402?.schema === STORE_SCHEMA) return globalStore.__u402;
  try {
    if (existsSync(/*turbopackIgnore: true*/ DATA_FILE)) {
      const parsed = JSON.parse(
        readFileSync(/*turbopackIgnore: true*/ DATA_FILE, "utf8"),
      ) as Record<string, unknown>;
      if (parsed.schema === STORE_SCHEMA || parsed.schema === "circuit-kreo-v2") {
        const db = migrate(parsed);
        globalStore.__u402 = db;
        return globalStore.__u402;
      }
    }
  } catch {
    // fall through
  }
  globalStore.__u402 = emptyDb();
  return globalStore.__u402;
}

function persist(db: Db) {
  globalStore.__u402 = db;
  try {
    if (!existsSync(/*turbopackIgnore: true*/ DATA_DIR)) {
      mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
    }
    writeFileSync(/*turbopackIgnore: true*/ DATA_FILE, JSON.stringify(db, null, 2));
  } catch {
    // Vercel / read-only fs — memory still works for the session
  }
}

export function getDb(): Db {
  return load();
}

export function saveDb() {
  persist(load());
}

/**
 * Legacy/lab path: create session with a spendable default mandate.
 * Shopper-registered sessions use createEmptyMandate via shoppers.ts instead.
 */
export function getOrCreateSession(sessionId: string): SessionState {
  const db = load();
  if (!db.sessions[sessionId]) {
    const mandate = createDefaultMandate(sessionId);
    db.mandates[mandate.id] = mandate;
    db.sessions[sessionId] = {
      id: sessionId,
      cart: [],
      mandateId: mandate.id,
      declineAttempts: 0,
      merchantId: MERCHANT_ID,
      budgetSet: true,
    };
    persist(db);
  }
  return db.sessions[sessionId];
}

export function createDefaultMandate(sessionId: string): Mandate {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return issueMandate({
    id: id("man"),
    agentId: `agt_${sessionId.slice(0, 8)}`,
    merchantId: MERCHANT_ID,
    maxPaise: 800000,
    remainingPaise: 800000,
    categories: "*",
    expiresAt,
    createdAt,
  });
}
