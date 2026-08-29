"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductTile } from "@/components/ProductTile";
import { useShop } from "@/components/ShopProvider";
import type { Campaign, Product } from "@/lib/types";

function saleFor(product: Product, campaigns: Campaign[]) {
  const live = campaigns.find(
    (c) =>
      c.active &&
      (c.categories.includes(product.category) || c.skus.includes(product.sku)),
  );
  if (!live) return undefined;
  return Math.round(product.pricePaise * (1 - live.percentOff / 100));
}

export function ShopGrid({ products }: { products: Product[] }) {
  const { addSku } = useShop();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  useEffect(() => {
    void fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d: { campaigns: Campaign[] }) => setCampaigns(d.campaigns));
  }, []);
  const priced = useMemo(
    () => products.map((p) => ({ p, sale: saleFor(p, campaigns) })),
    [products, campaigns],
  );
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
      {priced.map(({ p, sale }) => (
        <ProductTile key={p.sku} product={p} salePaise={sale} onAdd={(sku) => void addSku(sku)} />
      ))}
    </div>
  );
}
