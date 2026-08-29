"use client";

import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatInr } from "@/lib/money";

export function ProductTile({
  product,
  onAdd,
  salePaise,
}: {
  product: Product;
  onAdd: (sku: string) => void;
  salePaise?: number;
}) {
  return (
    <article className="group flex flex-col">
      <Link href={`/p/${product.sku}`} className="block overflow-hidden bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          referrerPolicy="no-referrer"
          className="aspect-square w-full object-contain transition duration-300 group-hover:scale-[1.02]"
        />
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        <Link href={`/p/${product.sku}`} className="font-medium leading-snug hover:underline">
          {product.name}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{product.short}</p>
        <div className="mt-2 flex items-baseline gap-2">
          {salePaise != null && salePaise < product.pricePaise ? (
            <>
              <span>{formatInr(salePaise)}</span>
              <span className="text-sm text-muted line-through">{formatInr(product.pricePaise)}</span>
            </>
          ) : (
            <span>{formatInr(product.pricePaise)}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onAdd(product.sku)}
          className="mt-3 w-full border border-fg py-2 text-sm hover:bg-fg hover:text-bg"
        >
          Add to bag
        </button>
      </div>
    </article>
  );
}
