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
  if (compact) {
    return (
      <article className="flex items-center gap-2.5 border border-line bg-card p-2 text-left">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain p-0.5"
          />
          {badge ? (
            <span className="absolute left-0 top-0 bg-fg px-1 text-[8px] leading-4 text-bg">{badge}</span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-[12px] font-medium leading-tight">{product.name}</h3>
          <p className="mt-0.5 text-[12px] tabular-nums text-muted">
            {product.discountedPaise ? formatInr(product.discountedPaise) : formatInr(product.pricePaise)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAdd(product.sku)}
          className="shrink-0 border border-fg px-2 py-1 text-[10px] hover:bg-fg hover:text-bg"
        >
          Add
        </button>
      </article>
    );
  }

  return (
    <article className="overflow-hidden border border-line bg-card text-left">
      <div className="relative aspect-square overflow-hidden bg-bg">
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
        <p className="line-clamp-2 text-xs text-muted">{product.short}</p>
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
