"use client";

import { formatInr } from "@/lib/money";
import type { ChatProductCard } from "@/lib/types";

export function ProductCard({
  product,
  badge,
  onAdd,
  compact,
}: {
  product: ChatProductCard;
  badge?: string;
  onAdd: (sku: string) => void;
  compact?: boolean;
}) {
  return (
    <article className="overflow-hidden border border-line bg-card text-left">
      <div className={`relative overflow-hidden ${compact ? "aspect-[5/4]" : "aspect-square"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
        />
        {badge ? (
          <span className="absolute left-2 top-2 bg-fg px-2 py-0.5 text-[10px] text-bg">{badge}</span>
        ) : null}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium leading-tight">{product.name}</h3>
          <p className="shrink-0 text-sm">
            {product.discountedPaise ? formatInr(product.discountedPaise) : formatInr(product.pricePaise)}
          </p>
        </div>
        <p className={`line-clamp-2 text-xs text-muted ${compact ? "line-clamp-1" : ""}`}>{product.short}</p>
        <button
          type="button"
          onClick={() => onAdd(product.sku)}
          className="mt-2 w-full border border-fg py-1.5 text-xs hover:bg-fg hover:text-bg"
        >
          Add to bag
        </button>
      </div>
    </article>
  );
}
