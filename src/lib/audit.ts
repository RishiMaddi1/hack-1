import type { AuditEvent } from "./types";
import { getDb, saveDb } from "./store";
import { id } from "./ids";

export function writeAudit(
  event: Omit<AuditEvent, "id" | "at">,
): AuditEvent {
  const row: AuditEvent = {
    ...event,
    id: id("aud"),
    at: new Date().toISOString(),
  };
  const db = getDb();
  db.audit.unshift(row);
  if (db.audit.length > 400) db.audit.length = 400;
  saveDb();
  return row;
}

export function listAudit(limit = 80): AuditEvent[] {
  return getDb().audit.slice(0, limit);
}
