"use client";

import { useEffect, useState } from "react";
import { formatInr } from "@/lib/money";
import type { Campaign } from "@/lib/types";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("Weekend pantry 5%");
  const [percentOff, setPercentOff] = useState(5);
  const [categories, setCategories] = useState("pantry");

  async function load() {
    const res = await fetch("/api/campaigns");
    const data = (await res.json()) as { campaigns: Campaign[] };
    setCampaigns(data.campaigns);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        percentOff,
        categories: categories.split(",").map((c) => c.trim()).filter(Boolean),
        budgetPaise: 200000,
        active: true,
      }),
    });
    await load();
  }

  async function toggle(c: Campaign) {
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, active: !c.active }),
    });
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Campaign orchestrator</p>
      <h1 className="font-[family-name:var(--font-serif)] text-4xl">Promos the agent may apply</h1>
      <p className="mt-2 text-sm text-muted">
        Rule-based: category, percent, budget, dates. The shop agent applies a campaign only when the
        cart is eligible and the mandate still holds.
      </p>
      <form onSubmit={create} className="mt-8 grid gap-3 rounded-3xl border border-line bg-ink-2 p-5 sm:grid-cols-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl border border-line bg-ink px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          type="number"
          value={percentOff}
          onChange={(e) => setPercentOff(Number(e.target.value))}
          className="rounded-xl border border-line bg-ink px-3 py-2 text-sm"
        />
        <input
          value={categories}
          onChange={(e) => setCategories(e.target.value)}
          className="rounded-xl border border-line bg-ink px-3 py-2 text-sm"
          placeholder="coffee,pantry"
        />
        <button type="submit" className="rounded-full bg-gold py-2 text-sm text-ink sm:col-span-4">
          Launch campaign
        </button>
      </form>
      <ul className="mt-6 space-y-3">
        {campaigns.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-2xl border border-line bg-ink-2 p-4">
            <div>
              <p className="font-[family-name:var(--font-serif)] text-xl">{c.name}</p>
              <p className="text-sm text-muted">
                {c.percentOff}% · {c.categories.join(", ") || "named SKUs"} · spent {formatInr(c.spentPaise)} of{" "}
                {formatInr(c.budgetPaise)}
              </p>
            </div>
            <button type="button" onClick={() => void toggle(c)} className="text-sm text-gold">
              {c.active ? "Pause" : "Resume"}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
