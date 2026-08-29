import { catalogFeed, PRODUCTS } from "@/lib/catalog";
import { formatInr } from "@/lib/money";

export default function CatalogPage() {
  const feed = catalogFeed();
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <p className="text-sm text-muted">Merchant · agent-readable catalogue</p>
      <h1 className="font-[family-name:var(--font-serif)] text-4xl">What the assistant searches</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Structured feed at GET /api/catalog. {PRODUCTS.length} SKUs, same stock as the shop floor.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map((p) => (
          <article key={p.sku} className="border border-line bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt={p.name} referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-contain bg-card" />
            <div className="space-y-1 p-4">
              <p className="font-[family-name:var(--font-mono)] text-[10px] text-muted">{p.sku}</p>
              <h2 className="font-medium">{p.name}</h2>
              <p>{formatInr(p.pricePaise)}</p>
              <p className="text-sm text-muted">{p.details}</p>
            </div>
          </article>
        ))}
      </div>
      <pre className="mt-10 max-h-80 overflow-auto border border-line bg-card p-4 font-[family-name:var(--font-mono)] text-[10px] text-muted">
        {JSON.stringify({ merchantId: feed.merchantId, protocol: feed.protocol, count: feed.products.length }, null, 2)}
      </pre>
    </main>
  );
}
