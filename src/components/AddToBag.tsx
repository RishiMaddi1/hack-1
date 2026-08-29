"use client";

import { useShop } from "@/components/ShopProvider";

export function AddToBag({ sku }: { sku: string }) {
  const { addSku } = useShop();
  return (
    <button type="button" onClick={() => void addSku(sku)} className="mt-8 bg-fg px-8 py-3 text-bg">
      Add to bag
    </button>
  );
}
