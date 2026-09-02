"use client";

import { useShop } from "@/components/ShopProvider";

export function AddToBag({ sku }: { sku: string }) {
  const { addSku, isSignedIn, authLoading } = useShop();
  const locked = authLoading || !isSignedIn;
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => void addSku(sku)}
      className="mt-8 bg-fg px-8 py-3 text-bg disabled:cursor-not-allowed disabled:opacity-40"
    >
      Add to bag
    </button>
  );
}
