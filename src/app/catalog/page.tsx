import { catalogFeed, PRODUCTS } from "@/lib/catalog";
import { formatInr } from "@/lib/money";

export default function CatalogPage() {
  const feed = catalogFeed();
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Agent-readable catalog</p>
      <h1 className="font-[family-name:var(--font-serif)] text-4xl">What the agent actually searches</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Same JSON-LD-shaped feed exposed at <code className="text-gold">GET /api/catalog</code>. Not a
        human browse grid pretending to be a protocol.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map((p) => (
          <article key={p.sku} className="overflow-hidden rounded-2xl border border-line bg-ink-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt={p.name} className="aspect-[4/3] w-full object-cover" />
            <div className="space-y-1 p-4">
              <p className="font-[family-name:var(--font-mono)] text-[10px] text-muted">{p.sku}</p>
              <h2 className="font-[family-name:var(--font-serif)] text-xl">{p.name}</h2>
              <p className="text-gold-2">{formatInr(p.pricePaise)}</p>
              <p className="text-sm text-muted">{p.details}</p>
            </div>
          </article>
        ))}
      </div>
      <pre className="mt-10 max-h-80 overflow-auto rounded-2xl border border-line bg-ink-2 p-4 font-[family-name:var(--font-mono)] text-[10px] text-muted">
        {JSON.stringify({ merchantId: feed.merchantId, protocol: feed.protocol, count: feed.products.length }, null, 2)}
      </pre>
    </main>
  );
}
