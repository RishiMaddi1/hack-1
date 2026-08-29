import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type {
  AuditEvent,
  Campaign,
  CheckoutRecord,
  GrowthRow,
  Mandate,
  CartLine,
  U402Quote,
} from "./types";
import { MERCHANT_ID } from "./catalog";
import { id } from "./ids";
import { issueMandate } from "./mandate-signer";

export type SessionState = {
  id: string;
  cart: CartLine[];
  mandateId: string;
  lastCheckoutId?: string;
  lastQuote?: U402Quote;
  declineAttempts: number;
  /** Set when an upsell SKU was added this session — feeds live AOV */
  acceptedUpsell?: boolean;
};

const STORE_SCHEMA = "circuit-kreo-v2";

type Db = {
  schema: string;
  sessions: Record<string, SessionState>;
  mandates: Record<string, Mandate>;
  campaigns: Campaign[];
  audit: AuditEvent[];
  checkouts: Record<string, CheckoutRecord>;
  growth: GrowthRow[];
};

const DATA_DIR = path.join(process.cwd(), "data");
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

function emptyDb(): Db {
  return {
    schema: STORE_SCHEMA,
    sessions: {},
    mandates: {},
    campaigns: seedCampaigns(),
    audit: [],
    checkouts: {},
    growth: seedGrowth(),
  };
}

function load(): Db {
  if (globalStore.__u402?.schema === STORE_SCHEMA) return globalStore.__u402;
  try {
    if (existsSync(DATA_FILE)) {
      const parsed = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Db;
      if (parsed.schema === STORE_SCHEMA) {
        globalStore.__u402 = parsed;
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
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
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
