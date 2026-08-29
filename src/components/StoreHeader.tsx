"use client";

import Link from "next/link";
import { useShop } from "@/components/ShopProvider";

export function StoreHeader() {
  const { cartCount, setCartOpen, setAskOpen } = useShop();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="font-[family-name:var(--font-serif)] text-2xl">
          Circuit
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
          <Link href="/shop" className="hover:text-fg">
            Shop
          </Link>
          <Link href="/shop?aisle=keyboard" className="hover:text-fg">
            Keyboards
          </Link>
          <Link href="/shop?aisle=mouse" className="hover:text-fg">
            Mice
          </Link>
          <Link href="/shop?aisle=controller" className="hover:text-fg">
            Controllers
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="rounded-full bg-fg px-3 py-1.5 text-sm text-bg"
          >
            Buyer agent
          </button>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-fg"
          >
            Cart{cartCount ? ` (${cartCount})` : ""}
          </button>
        </div>
      </div>
    </header>
  );
}
