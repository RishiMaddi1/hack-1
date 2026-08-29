import Link from "next/link";

const links = [
  { href: "/shop", label: "Shop" },
  { href: "/catalog", label: "Catalog" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/audit", label: "Audit" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-serif)] text-xl tracking-tight text-gold-2">
            u402
          </span>
          <span className="text-xs uppercase tracking-[0.2em] text-muted">Mandi Coffee</span>
        </Link>
        <nav className="flex gap-5 text-sm text-muted">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-paper">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
