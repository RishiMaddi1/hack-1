"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShop } from "@/components/ShopProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

export function StoreHeader() {
  const pathname = usePathname();
  const onShop = pathname === "/shop" || pathname.startsWith("/shop/");
  const { cartCount, setCartOpen, setAskOpen, username, isSignedIn, authLoading, openLogin, logout } =
    useShop();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-2.5 lg:px-8">
        <Link href="/" className="font-[family-name:var(--font-serif)] text-xl">
          Circuit
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
          <Link href="/shop" className="hover:text-fg">
            Shop
          </Link>
          <Link href="/lab" className="hover:text-fg">
            Lab
          </Link>
          <Link href="/audit" className="hover:text-fg">
            Audit
          </Link>
          <a href="/api/mcp" className="hover:text-fg">
            MCP
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {onShop ? (
            <>
              {isSignedIn && username ? (
                <span className="hidden max-w-[8rem] truncate text-sm text-muted sm:inline">
                  {username}
                </span>
              ) : null}
              {!authLoading && isSignedIn ? (
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:border-fg hover:text-fg"
                >
                  Log out
                </button>
              ) : !authLoading ? (
                <button
                  type="button"
                  onClick={openLogin}
                  className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-fg"
                >
                  Log in
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setAskOpen(true)}
                disabled={authLoading || !isSignedIn}
                className="rounded-full bg-fg px-3 py-1.5 text-sm text-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                Buyer agent
              </button>
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                disabled={authLoading || !isSignedIn}
                className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cart{cartCount ? ` (${cartCount})` : ""}
              </button>
            </>
          ) : (
            <Link href="/shop" className="rounded-full bg-fg px-3 py-1.5 text-sm text-bg">
              Enter shop
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
