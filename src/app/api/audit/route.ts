import { NextResponse } from "next/server";
import { listAudit } from "@/lib/audit";
import { getDb } from "@/lib/store";
import type { GrowthRow } from "@/lib/types";

function avg(rows: GrowthRow[]) {
  return rows.length ? Math.round(rows.reduce((s, r) => s + r.aovPaise, 0) / rows.length) : 0;
}

export function GET() {
  const db = getDb();
  const live = db.growth.filter((g) => g.source === "live");
  const seed = db.growth.filter((g) => g.source !== "live");
  const primary = live.length ? live : seed;
  const withUpsell = primary.filter((g) => g.withUpsell);
  const without = primary.filter((g) => !g.withUpsell);
  return NextResponse.json({
    events: listAudit(120),
    growth: {
      sessions: primary,
      liveCount: live.length,
      seedCount: seed.length,
      usingLive: live.length > 0,
      aovWithoutUpsell: avg(without),
      aovWithUpsell: avg(withUpsell),
      liftPaise: avg(withUpsell) - avg(without),
      syntheticBaseline:
        live.length > 0
          ? {
              aovWithoutUpsell: avg(seed.filter((g) => !g.withUpsell)),
              aovWithUpsell: avg(seed.filter((g) => g.withUpsell)),
              liftPaise:
                avg(seed.filter((g) => g.withUpsell)) - avg(seed.filter((g) => !g.withUpsell)),
            }
          : null,
    },
  });
}
