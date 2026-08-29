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
import { signMandate } from "./mandate";

export type SessionState = {
  id: string;
  cart: CartLine[];
  mandateId: string;
  lastCheckoutId?: string;
  lastQuote?: U402Quote;
  declineAttempts: number;
};

type Db = {
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
      id: "cmp_monsoon_coffee",
      name: "Monsoon coffee 10%",
      percentOff: 10,
      categories: ["coffee"],
      skus: [],
      budgetPaise: 500000,
      spentPaise: 42000,
      startsAt: now.toISOString(),
      endsAt: end.toISOString(),
      active: true,
    },
  ];
}

function seedGrowth(): GrowthRow[] {
  return [
    { id: "g1", withUpsell: false, aovPaise: 28900, recovered: true },
    { id: "g2", withUpsell: false, aovPaise: 22900, recovered: true },
    { id: "g3", withUpsell: false, aovPaise: 34900, recovered: true },
    { id: "g4", withUpsell: false, aovPaise: 18900, recovered: true },
    { id: "g5", withUpsell: false, aovPaise: 16900, recovered: true },
    { id: "g6", withUpsell: true, aovPaise: 37400, recovered: true },
    { id: "g7", withUpsell: true, aovPaise: 28400, recovered: true },
    { id: "g8", withUpsell: true, aovPaise: 41400, recovered: true },
    { id: "g9", withUpsell: true, aovPaise: 25400, recovered: true },
    { id: "g10", withUpsell: true, aovPaise: 34400, recovered: true },
  ];
}

function emptyDb(): Db {
  return {
    sessions: {},
    mandates: {},
    campaigns: seedCampaigns(),
    audit: [],
    checkouts: {},
    growth: seedGrowth(),
  };
}

function load(): Db {
  if (globalStore.__u402) return globalStore.__u402;
  try {
    if (existsSync(DATA_FILE)) {
      globalStore.__u402 = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Db;
      return globalStore.__u402;
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
  const unsigned = {
    id: id("man"),
    agentId: `agt_${sessionId.slice(0, 8)}`,
    merchantId: MERCHANT_ID,
    maxPaise: 50000,
    remainingPaise: 50000,
    categories: "*" as const,
    expiresAt,
    createdAt,
  };
  return { ...unsigned, signature: signMandate(unsigned) };
}
