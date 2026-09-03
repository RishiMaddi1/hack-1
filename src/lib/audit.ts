import { createHash } from "crypto";
import type { AuditEvent } from "./types";
import { getDb, saveDb } from "./store";
import { id } from "./ids";

const GENESIS = "0".repeat(64);

function canonicalBody(event: Omit<AuditEvent, "hash" | "prevHash">): string {
  return JSON.stringify({
    id: event.id,
    at: event.at,
    sessionId: event.sessionId,
    type: event.type,
    explainable: event.explainable,
    bounded: event.bounded,
    gated: event.gated,
    reason: event.reason,
    data: event.data,
  });
}

export function writeAudit(
  event: Omit<AuditEvent, "id" | "at" | "hash" | "prevHash">,
): AuditEvent {
  const db = getDb();
  // audit is newest-first; chain links to previous newest (= current tip)
  const tip = db.audit[0];
  const prevHash = tip?.hash || GENESIS;
  const rowBase: Omit<AuditEvent, "hash"> = {
    ...event,
    // Snapshot data — never store live session/cart refs or later mutations break the hash.
    data: JSON.parse(JSON.stringify(event.data ?? {})) as Record<string, unknown>,
    id: id("aud"),
    at: new Date().toISOString(),
    prevHash,
  };
  const hash = createHash("sha256")
    .update(prevHash + canonicalBody(rowBase))
    .digest("hex");
  const row: AuditEvent = { ...rowBase, hash };
  db.audit.unshift(row);
  // Keep a longer ring so merchant session drill-down still works for left carts.
  if (db.audit.length > 2000) db.audit.length = 2000;
  saveDb();
  return row;
}

export function listAudit(limit = 80): AuditEvent[] {
  return getDb().audit.slice(0, limit);
}

/** Verify newest→oldest: each prevHash matches the older row's hash (or genesis). */
export function verifyAuditChain(): { ok: boolean; checked: number; brokenAt?: string } {
  const rows = getDb().audit;
  if (!rows.length) return { ok: true, checked: 0 };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.hash) {
      const body: Omit<AuditEvent, "hash" | "prevHash"> = {
        id: row.id,
        at: row.at,
        sessionId: row.sessionId,
        type: row.type,
        explainable: row.explainable,
        bounded: row.bounded,
        gated: row.gated,
        reason: row.reason,
        data: row.data,
      };
      const prev = row.prevHash || GENESIS;
      const recomputed = createHash("sha256")
        .update(prev + canonicalBody(body))
        .digest("hex");
      if (recomputed !== row.hash) {
        return { ok: false, checked: i + 1, brokenAt: row.id };
      }
    }
    if (i + 1 < rows.length) {
      const older = rows[i + 1]!;
      if (row.prevHash && older.hash && row.prevHash !== older.hash) {
        return { ok: false, checked: i + 1, brokenAt: row.id };
      }
    }
  }
  return { ok: true, checked: rows.length };
}

/**
 * Reseal newest←oldest hashes from current row bodies.
 * Recovers from legacy bugs (e.g. live cart refs mutating audit.data after write).
 */
export function repairAuditChain(): { repaired: number } {
  const db = getDb();
  const rows = db.audit;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    const older = i === rows.length - 1 ? undefined : rows[i + 1];
    const prevHash = older?.hash || GENESIS;
    row.prevHash = prevHash;
    const body: Omit<AuditEvent, "hash" | "prevHash"> = {
      id: row.id,
      at: row.at,
      sessionId: row.sessionId,
      type: row.type,
      explainable: row.explainable,
      bounded: row.bounded,
      gated: row.gated,
      reason: row.reason,
      data: row.data,
    };
    row.hash = createHash("sha256")
      .update(prevHash + canonicalBody(body))
      .digest("hex");
  }
  saveDb();
  return { repaired: rows.length };
}
