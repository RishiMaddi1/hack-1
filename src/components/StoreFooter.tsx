import Link from "next/link";

export function StoreFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted">
        <p>Circuit · Bengaluru · Test-mode payments on Razorpay</p>
        <div className="flex gap-4">
          <Link href="/catalog" className="hover:text-fg">
            Catalogue feed
          </Link>
          <Link href="/campaigns" className="hover:text-fg">
            Offers
          </Link>
          <Link href="/audit" className="hover:text-fg">
            Order log
          </Link>
          <Link href="/lab" className="hover:text-fg">
            Gate lab
          </Link>
        </div>
      </div>
    </footer>
  );
}
