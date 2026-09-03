"use client";

import { formatInr } from "@/lib/money";
import type { ChatProductCard } from "@/lib/types";

/** Chat match tile — square image, name/price/Add below. Used in a 2-col grid. */
export function ChatProductRow({
  product,
  badge,
  onAdd,
}: {
  product: ChatProductCard;
  badge?: string;
  onAdd: (sku: string) => void;
}) {
  return (
    <article className="flex min-w-0 flex-col overflow-hidden border border-line bg-card">
      <div className="relative aspect-square overflow-hidden bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
        />
        {badge ? (
          <span className="absolute left-0 top-0 bg-fg px-1.5 text-[10px] leading-[18px] text-bg">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <div className="line-clamp-2 min-h-[2.4em] text-[12px] font-medium leading-snug">
          {product.name}
        </div>
        <div className="text-[13px] tabular-nums">
          {product.discountedPaise ? formatInr(product.discountedPaise) : formatInr(product.pricePaise)}
        </div>
        <button
          type="button"
          onClick={() => onAdd(product.sku)}
          className="mt-auto w-full border border-fg py-1.5 text-[11px] hover:bg-fg hover:text-bg"
        >
          Add
        </button>
      </div>
    </article>
  );
}
