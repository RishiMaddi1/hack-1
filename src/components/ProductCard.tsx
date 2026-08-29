"use client";

import { formatInr } from "@/lib/money";
import type { ChatProductCard } from "@/lib/types";

export function ProductCard({
  product,
  badge,
  onAdd,
}: {
  product: ChatProductCard;
  badge?: string;
  onAdd: (sku: string) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-ink-2">
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        {badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-[family-name:var(--font-serif)] text-lg leading-tight">{product.name}</h3>
          <div className="text-right">
            {product.discountedPaise ? (
              <>
                <p className="text-xs text-muted line-through">{formatInr(product.pricePaise)}</p>
                <p className="text-gold-2">{formatInr(product.discountedPaise)}</p>
              </>
            ) : (
              <p className="text-gold-2">{formatInr(product.pricePaise)}</p>
            )}
          </div>
        </div>
        <p className="text-sm text-muted">{product.short}</p>
        <p className="text-xs leading-relaxed text-paper/70">{product.details}</p>
        <button
          type="button"
          onClick={() => onAdd(product.sku)}
          className="mt-1 w-full rounded-full bg-gold py-2 text-sm font-medium text-ink hover:bg-gold-2"
        >
          Add to cart
        </button>
      </div>
    </article>
  );
}
