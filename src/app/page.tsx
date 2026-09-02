import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { DemoPaths } from "@/components/DemoPaths";

export const metadata: Metadata = {
  title: "Circuit · u402 — Agentic commerce on Razorpay",
  description:
    "Kreo desk shop agents can buy from under a signed spend cap, on Razorpay test mode. Track 01 reference merchant.",
};

const heroLinks = [
  {
    href: "/shop",
    label: "Enter the shop",
    blurb: "Register, set a budget, chat-buy, then pay in Razorpay Checkout.",
    primary: true,
  },
  {
    href: "/lab",
    label: "Gate lab",
    blurb: "Run real attacks — detection log shows what was checked and why it blocked.",
    primary: false,
  },
  {
    href: "/audit",
    label: "Merchant audit",
    blurb: "Cart adds, paid, failed, open quotes, and left carts — by session.",
    primary: false,
  },
  {
    href: "/.well-known/agent-commerce.json",
    label: "Agent discovery",
    blurb: "JSON map of MCP URL, tools, and how agents find this shop.",
    primary: false,
    external: true,
  },
];

const flows = [
  {
    n: "01",
    title: "Register",
    body: "Pick a username → shopper_token. Cart and orders stick to that identity.",
    cue: "You",
  },
  {
    n: "02",
    title: "Set budget",
    body: "Sign an Ed25519 spend cap (e.g. ₹8,000). No mandate → cart stays locked.",
    cue: "Cap",
  },
  {
    n: "03",
    title: "Shop & quote",
    body: "Search, fill cart, request checkout. Server prices the bag and returns HTTP 402 + Razorpay Order.",
    cue: "402",
  },
  {
    n: "04",
    title: "Pay",
    body: "Confirm on Razorpay Checkout or open the Payment Link. Mandate enforced. Trail hits /audit.",
    cue: "₹",
  },
];

const doors = [
  {
    href: "/shop",
    label: "Shop UI",
    blurb: "Human + buyer-agent path — same Gate as MCP.",
  },
  {
    href: "/lab",
    label: "Gate lab",
    blurb: "Prove the money rules: forged mandate, underpay, replay.",
  },
  {
    href: "/audit",
    label: "Audit",
    blurb: "Who spent what, mandate left, live AOV, hash chain status.",
  },
  {
    href: "/api/mcp",
    label: "MCP endpoint",
    blurb: "HTTP tool socket — point Claude, Cursor, or a script here.",
    external: true,
  },
];

function StepGlyph({ n }: { n: string }) {
  if (n === "01") {
    return (
      <svg viewBox="0 0 48 48" className="h-8 w-8 text-fg" aria-hidden>
        <circle cx="24" cy="18" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 40c2.5-9 9-14 14-14s11.5 5 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (n === "02") {
    return (
      <svg viewBox="0 0 48 48" className="h-8 w-8 text-fg" aria-hidden>
        <rect x="10" y="14" width="28" height="22" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18 14v-3a6 6 0 0 1 12 0v3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="24" cy="25" r="2.5" fill="currentColor" />
      </svg>
    );
  }
  if (n === "03") {
    return (
      <svg viewBox="0 0 48 48" className="h-8 w-8 text-fg" aria-hidden>
        <rect x="8" y="12" width="32" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 20h32M16 28h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <text
          x="34"
          y="31"
          textAnchor="middle"
          fill="currentColor"
          fontSize="8"
          fontFamily="ui-monospace, monospace"
        >
          402
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8 text-fg" aria-hidden>
      <rect x="9" y="16" width="30" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 22h30" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="30" r="2" fill="currentColor" />
      <circle cx="24" cy="30" r="2" fill="currentColor" />
    </svg>
  );
}

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-start gap-6 px-5 py-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-8 md:py-10 lg:px-8">
        <div>
          <p className="text-sm text-muted">Razorpay AI Buildathon · Track 01</p>
          <h1 className="mt-1.5 font-[family-name:var(--font-serif)] text-4xl leading-[1.12] text-fg md:text-5xl">
            Circuit
          </h1>
          <p className="mt-3 font-[family-name:var(--font-serif)] text-xl leading-snug text-muted md:text-2xl">
            Gaming-desk shop an AI can actually buy from — on Razorpay test mode.
          </p>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted md:text-base">
            Real Kreo catalog. Shopper signs a spend cap before the cart unlocks. Checkout returns a
            Razorpay quote (HTTP 402) under that mandate. Website buyer agent and MCP tools share one
            Gate — same prices, same budget, same audit.
          </p>

          <ul className="mt-6 flex max-w-xl flex-col gap-2.5">
            {heroLinks.map((item) => {
              const btn = item.primary
                ? "shrink-0 bg-fg px-3 py-2 text-sm text-bg"
                : "shrink-0 border border-fg px-3 py-2 text-sm";
              const row = (
                <>
                  <span className={btn}>{item.label}</span>
                  <span className="text-sm leading-snug text-muted">{item.blurb}</span>
                </>
              );
              return (
                <li key={item.href}>
                  {item.external ? (
                    <a href={item.href} className="flex items-center gap-3">
                      {row}
                    </a>
                  ) : (
                    <Link href={item.href} className="flex items-center gap-3">
                      {row}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <Link
          href="/shop"
          className="group block border border-line bg-card outline-none transition-colors hover:border-fg"
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <span className="size-2 rounded-full bg-line" />
            <span className="size-2 rounded-full bg-line" />
            <span className="size-2 rounded-full bg-line" />
            <span className="ml-2 font-mono text-xs text-muted">circuit.local/shop</span>
            <span className="ml-auto text-xs text-muted group-hover:text-fg">Open ↗</span>
          </div>
          <div className="w-full bg-bg">
            <Image
              src="/demo-shop.png"
              alt="Circuit shop with buyer agent, HTTP 402 quote, and mandate remaining"
              width={1553}
              height={931}
              className="h-auto w-full"
              sizes="(max-width: 768px) 100vw, 60vw"
              priority
            />
          </div>
          <p className="border-t border-line px-3 py-2.5 text-xs text-muted">
            Live path in one shot: shop grid, buyer agent, 402 quote, mandate left. Click to use it.
          </p>
        </Link>
      </section>

      {/* What it is */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-7xl px-5 py-9 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">What this is</p>
          <h2 className="mt-1.5 max-w-3xl font-[family-name:var(--font-serif)] text-2xl text-fg md:text-3xl">
            A reference merchant for agentic commerce on Razorpay.
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-fg">What you can demo</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Browse ~60 Kreo SKUs, talk to the buyer agent, set a signed ₹ budget, type{" "}
                <span className="font-mono text-fg">pay</span>, confirm the card in Razorpay. Over
                budget → 403, no Order. Every money step is in the audit log.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-fg">Why Razorpay</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                US/crypto “agent pay” stacks don’t settle Indian merchants. Circuit shows a
                Razorpay-native pattern: Orders + Payment Links + a spend mandate. If website builder
                shipped this MCP on every shop, any AI buyer could transact without a custom chat UI
                per merchant.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Read this — how the purchase works */}
      <section className="border-t border-line bg-card/50">
        <div className="mx-auto max-w-7xl px-5 py-9 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">Read this first</p>
          <h2 className="mt-1.5 max-w-3xl font-[family-name:var(--font-serif)] text-2xl md:text-3xl">
            One purchase path — browser or AI agent.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted md:text-base">
            Everything here is live on Razorpay <span className="text-fg">test mode</span>. Same Gate
            whether a human uses the shop or an AI calls MCP. No real money moves — the point is the
            mandate, the 402 quote, and the audit trail.
          </p>

          <DemoPaths />

          <ol className="mt-8 grid gap-3 lg:grid-cols-4 lg:gap-0">
            {flows.map((f, i) => (
              <li
                key={f.n}
                className={`relative border border-line bg-bg p-4 ${
                  i < flows.length - 1 ? "lg:border-r-0" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <StepGlyph n={f.n} />
                  <span className="font-mono text-xs text-muted">{f.cue}</span>
                </div>
                <p className="mt-3 font-mono text-xs text-muted">{f.n}</p>
                <p className="mt-0.5 text-sm font-medium text-fg">{f.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted md:text-sm">{f.body}</p>
                {i < flows.length - 1 ? (
                  <span
                    className="pointer-events-none absolute -right-2.5 top-[2.75rem] z-10 hidden text-lg text-muted lg:block"
                    aria-hidden
                  >
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* MCP */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-7xl px-5 py-9 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">MCP</p>
          <h2 className="mt-1.5 max-w-3xl font-[family-name:var(--font-serif)] text-2xl md:text-3xl">
            The merchant exposes tools — any AI shopper can use them.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted md:text-base">
            <strong className="font-medium text-fg">MCP</strong> is how an agent finds and calls this
            shop’s actions. It is not a second checkout. Point a client at{" "}
            <a href="/api/mcp" className="font-mono text-fg underline-offset-2 hover:underline">
              /api/mcp
            </a>{" "}
            (discovery at{" "}
            <a
              href="/.well-known/agent-commerce.json"
              className="font-mono text-fg underline-offset-2 hover:underline"
            >
              /.well-known/agent-commerce.json
            </a>
            ) and the agent walks the same path as the website buyer.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            {[
              { name: "Claude", blurb: "Remote MCP → this shop’s tool list" },
              { name: "Cursor", blurb: "Same HTTP socket, same Gate" },
              { name: "OpenAI", blurb: "Tool-calling against the merchant tools" },
              { name: "Any client", blurb: "JSON-RPC over /api/mcp" },
            ].map((c) => (
              <div
                key={c.name}
                className="min-w-[8rem] flex-1 border border-line bg-card px-3 py-2.5 sm:max-w-[12rem]"
              >
                <p className="font-[family-name:var(--font-serif)] text-lg">{c.name}</p>
                <p className="mt-0.5 text-xs text-muted">{c.blurb}</p>
              </div>
            ))}
          </div>

          <ol className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {[
              "register_shopper",
              "set_budget",
              "search_catalog",
              "add_to_cart",
              "quote_checkout",
            ].map((t, i) => (
              <li key={t} className="border border-line bg-bg px-2.5 py-2.5">
                <p className="font-mono text-[10px] text-muted">0{i + 1}</p>
                <p className="mt-0.5 break-all font-mono text-xs text-fg">{t}</p>
              </li>
            ))}
          </ol>

          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
            After <span className="font-mono text-fg">quote_checkout</span>, the agent gets an HTTP
            402 with a Razorpay Order + Payment Link. The human confirms the card; mandate and audit
            stay on this merchant — not a parallel money rail.
          </p>
        </div>
      </section>

      {/* Explore */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-7xl px-5 py-9 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Explore</p>
          <h2 className="mt-1.5 font-[family-name:var(--font-serif)] text-2xl md:text-3xl">
            Jump in
          </h2>
          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {doors.map((d) => (
              <li key={d.href}>
                {d.external ? (
                  <a
                    href={d.href}
                    className="flex h-full flex-col border border-line bg-bg p-4 transition-colors hover:border-fg"
                  >
                    <span className="text-sm font-medium text-fg">{d.label}</span>
                    <span className="mt-1.5 text-sm text-muted">{d.blurb}</span>
                  </a>
                ) : (
                  <Link
                    href={d.href}
                    className="flex h-full flex-col border border-line bg-bg p-4 transition-colors hover:border-fg"
                  >
                    <span className="text-sm font-medium text-fg">{d.label}</span>
                    <span className="mt-1.5 text-sm text-muted">{d.blurb}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Vision */}
      <section className="border-t border-line bg-fg text-bg">
        <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-bg/60">The vision</p>
              <h2 className="mt-2 max-w-3xl font-[family-name:var(--font-serif)] text-2xl leading-snug md:text-3xl">
                Razorpay settles the money. The website builder should make every product AI-shoppable.
              </h2>
              <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-bg/75 md:text-base">
                <p>
                  Today Razorpay gives merchants pages, checkout, Orders, and Payment Links — the rails.
                  What&apos;s missing is the <strong className="font-medium text-bg">merchant shape</strong>{" "}
                  agents expect: a catalog, a spend mandate, MCP tools, and HTTP 402 quotes on the same Gate.
                </p>
                <p>
                  Imagine an AI website builder — or a “upload your catalog” step in Razorpay — that ships
                  this on every shop: discovery at{" "}
                  <span className="font-mono text-bg/90">/.well-known/agent-commerce.json</span>, tools at{" "}
                  <span className="font-mono text-bg/90">/api/mcp</span>, one purchase path for humans and
                  agents. No custom chat UI per store. No second payment stack.
                </p>
                <p className="font-[family-name:var(--font-serif)] text-lg text-bg md:text-xl">
                  Circuit is that reference merchant — Kreo live, mandate-gated, audit on-chain. Proof that
                  Indian checkout and agentic commerce can be the same product.
                </p>
              </div>
            </div>
            <div className="overflow-hidden border border-bg/20 bg-bg/5">
              <Image
                src="/vision-agent-commerce.png"
                alt="AI website builder ships catalog and MCP tools so agents and humans share one Razorpay checkout path"
                width={1200}
                height={675}
                className="h-auto w-full"
                sizes="(max-width: 1024px) 100vw, 45vw"
              />
            </div>
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              {
                title: "Builder ships the rail",
                body: "Catalog + MCP + mandate baked into every site Razorpay hosts.",
              },
              {
                title: "Every SKU is agent-readable",
                body: "Search, cart, quote — same tools whether the buyer is human or AI.",
              },
              {
                title: "Human still pays on Razorpay",
                body: "402 quote, Order, Payment Link. Agents never touch card data.",
              },
            ].map((item) => (
              <li key={item.title} className="border border-bg/20 bg-bg/5 p-4">
                <p className="text-sm font-medium text-bg">{item.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-bg/70 md:text-sm">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
