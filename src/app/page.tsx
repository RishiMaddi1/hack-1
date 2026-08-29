import Link from "next/link";

const pills = [
  "Conversational checkout",
  "Agent-readable catalog",
  "Upsell & cross-sell",
  "Campaign orchestrator",
  "Razorpay test Orders",
  "Mandate + audit trail",
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-16">
      <p className="text-[11px] uppercase tracking-[0.25em] text-gold">Razorpay AI Buildathon · Track 01</p>
      <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-serif)] text-5xl leading-tight sm:text-7xl">
        Make a merchant sellable to an AI buyer.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
        u402 is HTTP 402 settled on Razorpay test-mode, authorised like UAP. Talk to Mandi Coffee, click
        Add to cart, or tell the agent. Every rupee is explained, bounded, and gated.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/shop" className="rounded-full bg-gold px-6 py-3 text-sm font-medium text-ink">
          Open the shop
        </Link>
        <Link href="/audit" className="rounded-full border border-line px-6 py-3 text-sm">
          Flight recorder
        </Link>
      </div>
      <ul className="mt-12 flex flex-wrap gap-2">
        {pills.map((p) => (
          <li key={p} className="rounded-full border border-line px-3 py-1 text-xs text-muted">
            {p}
          </li>
        ))}
      </ul>
    </main>
  );
}
