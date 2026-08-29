import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, PRODUCTS } from "@/lib/catalog";
import { formatInr } from "@/lib/money";
import { ShopGrid } from "@/components/ShopGrid";
import { AddToBag } from "@/components/AddToBag";

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = getProduct(sku);
  if (!product) notFound();
  const related = PRODUCTS.filter((p) => p.category === product.category && p.sku !== product.sku).slice(0, 4);
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <p className="text-sm text-muted">
        <Link href="/shop" className="underline">
          Shop
        </Link>{" "}
        / {product.category}
      </p>
      <div className="mt-6 grid gap-10 md:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          referrerPolicy="no-referrer"
          className="aspect-square w-full bg-card object-contain"
        />
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-4xl">{product.name}</h1>
          <p className="mt-3 text-xl">{formatInr(product.pricePaise)}</p>
          <p className="mt-4 leading-relaxed text-muted">{product.details}</p>
          <p className="mt-2 text-sm text-muted">{product.short}</p>
          <AddToBag sku={product.sku} />
        </div>
      </div>
      {related.length ? (
        <section className="mt-16">
          <h2 className="font-[family-name:var(--font-serif)] text-2xl">Also in this aisle</h2>
          <div className="mt-6">
            <ShopGrid products={related} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
