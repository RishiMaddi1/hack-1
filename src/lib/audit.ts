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
    id: id("aud"),
    at: new Date().toISOString(),
    prevHash,
  };
  const hash = createHash("sha256")
    .update(prevHash + canonicalBody(rowBase))
    .digest("hex");
  const row: AuditEvent = { ...rowBase, hash };
  db.audit.unshift(row);
  if (db.audit.length > 400) db.audit.length = 400;
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
    const expectedPrev = i === rows.length - 1 ? GENESIS : rows[i + 1]?.hash || GENESIS;
    // We store newest-first: row[i].prevHash should equal row[i+1].hash (older)
    const olderHash = i + 1 < rows.length ? rows[i + 1]!.hash : GENESIS;
    if (row.prevHash && olderHash && row.prevHash !== olderHash && row.prevHash !== expectedPrev) {
      // Prefer: prevHash of newer === hash of next (older) in array
    }
    if (row.hash) {
      const body: Omit<AuditEvent, "hash"> = {
        id: row.id,
        at: row.at,
        sessionId: row.sessionId,
        type: row.type,
        explainable: row.explainable,
        bounded: row.bounded,
        gated: row.gated,
        reason: row.reason,
        data: row.data,
        prevHash: row.prevHash,
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
        // Legacy unhashed rows: skip link check if older has no hash
        if (older.hash) {
          return { ok: false, checked: i + 1, brokenAt: row.id };
        }
      }
    } else if (row.prevHash && row.prevHash !== GENESIS && row.hash) {
      // Oldest with non-genesis prev is ok if migrated mid-chain
    }
  }
  return { ok: true, checked: rows.length };
}
