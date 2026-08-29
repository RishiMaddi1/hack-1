import Link from "next/link";
import { PRODUCTS } from "@/lib/catalog";
import { ShopGrid } from "@/components/ShopGrid";

const featured = PRODUCTS.filter((p) =>
  [
    "swarm65-black-purple-wireless-mechanical-gaming-keyboard-copy",
    "harpy-black-light-weight-rgb-gaming-mouse",
    "surge-pro-wireless-gaming-controller-with-tmr-joysticks",
    "hive75-he-wired-magnetic-hall-effect-gaming-keyboard",
    "obsidian-27-inch-100hz-2k-1440p-qhd-ips-monitor",
    "beluga-gaming-headphone",
    "terra-xxl-deskmat-pixel-dream",
    "anzu-v2-white-ultralight-ergonomic-wireless-gaming-mouse",
  ].includes(p.sku),
);

const hero = PRODUCTS.find((p) => p.sku === "hive75-he-wired-magnetic-hall-effect-gaming-keyboard");

export default function Home() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 md:grid-cols-2 md:py-16">
        <div>
          <p className="text-sm text-muted">Indiranagar · open today 11am–9pm</p>
          <h1 className="mt-2 font-[family-name:var(--font-serif)] text-4xl leading-tight md:text-5xl">
            Keyboards, mice, monitors. Paid without a fuss.
          </h1>
          <p className="mt-4 max-w-md text-muted leading-relaxed">
            Circuit stocks Kreo desks: keyboards, mice, controllers, monitors. Walk the aisles, or
            say “Swarm keyboard and Harpy mouse under five thousand” and we’ll pack the bag.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/shop" className="bg-fg px-5 py-2.5 text-sm text-bg">
              Shop the store
            </Link>
            <Link href="/shop?aisle=keyboard" className="border border-fg px-5 py-2.5 text-sm">
              Keyboards this week
            </Link>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero?.image ?? PRODUCTS[0].image}
          alt={hero?.name ?? "Gaming keyboard"}
          referrerPolicy="no-referrer"
          className="h-[380px] w-full bg-card object-contain"
        />
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="font-[family-name:var(--font-serif)] text-3xl">On the desk</h2>
          <Link href="/shop" className="text-sm underline">
            All {PRODUCTS.length} items
          </Link>
        </div>
        <ShopGrid products={featured} />
      </section>
    </main>
  );
}
