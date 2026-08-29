import { PRODUCTS } from "@/lib/catalog";
import { ShopGrid } from "@/components/ShopGrid";

const aisles = [
  { id: "all", label: "All" },
  { id: "keyboard", label: "Keyboards" },
  { id: "mouse", label: "Mice" },
  { id: "controller", label: "Controllers" },
  { id: "monitor", label: "Monitors" },
  { id: "audio", label: "Audio" },
  { id: "accessory", label: "Accessories" },
];

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ aisle?: string }>;
}) {
  const { aisle = "all" } = await searchParams;
  const products = aisle === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.category === aisle);
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="font-[family-name:var(--font-serif)] text-4xl">The shop</h1>
      <p className="mt-2 max-w-xl text-muted">
        {PRODUCTS.length} things in stock. Click into anything, add from the card, or ask the shop if you’d
        rather talk.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {aisles.map((a) => (
          <a
            key={a.id}
            href={a.id === "all" ? "/shop" : `/shop?aisle=${a.id}`}
            className={`border px-3 py-1 text-sm ${aisle === a.id ? "border-fg bg-fg text-bg" : "border-line"}`}
          >
            {a.label}
          </a>
        ))}
      </div>
      <div className="mt-10">
        <ShopGrid products={products} />
      </div>
    </main>
  );
}
