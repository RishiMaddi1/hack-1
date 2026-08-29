import { NextResponse } from "next/server";
import { listAudit } from "@/lib/audit";
import { getDb } from "@/lib/store";

export function GET() {
  const db = getDb();
  const withUpsell = db.growth.filter((g) => g.withUpsell);
  const without = db.growth.filter((g) => !g.withUpsell);
  const avg = (rows: typeof db.growth) =>
    rows.length ? Math.round(rows.reduce((s, r) => s + r.aovPaise, 0) / rows.length) : 0;
  return NextResponse.json({
    events: listAudit(120),
    growth: {
      sessions: db.growth,
      aovWithoutUpsell: avg(without),
      aovWithUpsell: avg(withUpsell),
      liftPaise: avg(withUpsell) - avg(without),
    },
  });
}
