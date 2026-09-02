import { MERCHANT_ID, MERCHANT_NAME } from "./catalog";
import { getDb, saveDb } from "./store";
import type { MerchantRecord } from "./types";

export function ensureMerchantsSeeded() {
  const db = getDb();
  if (!db.merchants[MERCHANT_ID]) {
    db.merchants[MERCHANT_ID] = {
      id: MERCHANT_ID,
      name: MERCHANT_NAME,
      mcpPath: "/api/mcp",
      catalogPath: "/api/catalog",
    };
    saveDb();
  }
}

export function listMerchants(): MerchantRecord[] {
  ensureMerchantsSeeded();
  return Object.values(getDb().merchants);
}

export function getMerchant(merchantId: string): MerchantRecord | null {
  ensureMerchantsSeeded();
  return getDb().merchants[merchantId] ?? null;
}

export function assertMerchant(merchantId?: string): MerchantRecord {
  const id = merchantId || MERCHANT_ID;
  const m = getMerchant(id);
  if (!m) {
    throw new Error(`Unknown merchant_id ${id}`);
  }
  return m;
}
