"use client";

import { useEffect, useState } from "react";
import { formatInr } from "@/lib/money";
import type { AuditEvent, GrowthRow } from "@/lib/types";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [growth, setGrowth] = useState<{
    sessions: GrowthRow[];
    aovWithoutUpsell: number;
    aovWithUpsell: number;
    liftPaise: number;
  } | null>(null);

  useEffect(() => {
    const tick = async () => {
      const res = await fetch("/api/audit");
      const data = await res.json();
      setEvents(data.events);
      setGrowth(data.growth);
    };
    void tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold">The bar</p>
      <h1 className="font-[family-name:var(--font-serif)] text-4xl">Flight recorder</h1>
      <p className="mt-2 text-sm text-muted">
        Every money action: explainable, bounded, gated. Including the decline stop rule.
      </p>
      {growth ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat label="AOV without upsell" value={formatInr(growth.aovWithoutUpsell)} />
          <Stat label="AOV with upsell" value={formatInr(growth.aovWithUpsell)} />
          <Stat label="Lift across 10 sessions" value={formatInr(growth.liftPaise)} />
        </div>
      ) : null}
      <ol className="mt-8 space-y-2">
        {events.map((e) => (
          <li key={e.id} className="rounded-2xl border border-line bg-ink-2 p-4">
            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-muted">
              <span className="text-gold">{e.type}</span>
              <span>{new Date(e.at).toLocaleTimeString()}</span>
              {e.explainable ? <span>explainable</span> : null}
              {e.bounded ? <span>bounded</span> : null}
              {e.gated ? <span>gated</span> : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed">{e.reason}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-ink-2 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-[family-name:var(--font-serif)] text-2xl text-gold-2">{value}</p>
    </div>
  );
}
