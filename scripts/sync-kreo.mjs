/**
 * Pull Kreo's public Shopify storefront feed into src/lib/catalog.ts.
 * Source: https://kreo-tech.com/products.json (no HTML scrape).
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const FEED = "https://kreo-tech.com/products.json?limit=250";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickImage(p) {
  const imgs = p.images || [];
  const raster = imgs.filter((i) => /\.(png|jpe?g|webp|gif)/i.test(i.src || ""));
  const ok = raster.find((i) => !/\.bip/i.test(i.src || "")) || raster[0];
  if (!ok?.src) return "";
  const src = ok.src.split("&width=")[0];
  return src.includes("?") ? `${src}&width=800` : `${src}?width=800`;
}

function categoryOf(p) {
  const hay = `${p.title} ${p.product_type || ""} ${p.tags || ""} ${p.handle}`.toLowerCase();
  if (/chair/.test(hay)) return "accessory";
  if (/cooler|webcam|capture|tripod|ring light|key light|keychain/.test(hay)) return "accessory";
  if (/mousepad|deskmat|locus|terra|cliff/.test(hay)) return "accessory";
  if (/\bkeyboard\b|swarm65|hive75|hive98|hive65|swarm x/.test(hay)) return "keyboard";
  if (/\bmouse\b|harpy|anzu|arma|chimera/.test(hay)) return "mouse";
  if (/monitor|obsidian/.test(hay)) return "monitor";
  if (/headphone|headset|mic|podcast|boom arm|shock mount|sonik|kast|beluga/.test(hay)) return "audio";
  if (/controller|surge|mirage|gamepad/.test(hay)) return "controller";
  return "accessory";
}

function skuOf(handle) {
  const s = String(handle)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "sku";
}

function tagsOf(p, category) {
  const raw = String(p.tags || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && t !== "no-timer" && t !== "onlinesoftware");
  return [...new Set([category, "kreo", p.vendor?.toLowerCase(), ...raw, ...p.handle.split("-").slice(0, 3)])].filter(
    Boolean,
  );
}

function pickUpsell(list, p) {
  const rest = list.filter((x) => x.sku !== p.sku).sort((a, b) => a.pricePaise - b.pricePaise);
  if (p.category === "keyboard") return rest.find((x) => x.category === "mouse")?.sku;
  if (p.category === "mouse") return rest.find((x) => /pad|deskmat/i.test(x.name))?.sku;
  if (p.category === "controller") return rest.find((x) => x.category === "mouse")?.sku;
  if (p.category === "audio" && /mic/i.test(p.name) && !/combo|arm/i.test(p.name)) {
    return rest.find((x) => /boom arm/i.test(x.name))?.sku;
  }
  if (p.category === "monitor") return rest.find((x) => x.category === "keyboard")?.sku;
  return undefined;
}

const res = await fetch(FEED);
if (!res.ok) throw new Error(`Kreo feed HTTP ${res.status}`);
const { products: raw } = await res.json();

const seen = new Set();
const products = [];
for (const p of raw) {
  const image = pickImage(p);
  const variant = (p.variants || []).find((v) => v.available) || p.variants?.[0];
  const price = Number(variant?.price);
  if (!image || !Number.isFinite(price) || price <= 0) continue;
  let sku = skuOf(p.handle);
  if (seen.has(sku)) sku = `${sku}-${products.length}`;
  seen.add(sku);
  const details = stripHtml(p.body_html).slice(0, 280) || p.title;
  const short = details.split(/(?<=[.!?])\s/)[0].slice(0, 90);
  products.push({
    sku,
    name: p.title.trim(),
    short,
    details,
    category: categoryOf(p),
    pricePaise: Math.round(price * 100),
    image,
    tags: tagsOf(p, categoryOf(p)),
  });
}

for (const p of products) {
  const up = pickUpsell(products, p);
  if (up) p.upsellSku = up;
}

function tsString(v) {
  return JSON.stringify(v);
}

const items = products
  .map((p) => {
    const up = p.upsellSku ? `\n    upsellSku: ${tsString(p.upsellSku)},` : "";
    return `  {
    sku: ${tsString(p.sku)},
    name: ${tsString(p.name)},
    short: ${tsString(p.short)},
    details: ${tsString(p.details)},
    category: ${tsString(p.category)},
    pricePaise: ${p.pricePaise},
    image: ${tsString(p.image)},
    tags: ${tsString(p.tags)},${up}
  }`;
  })
  .join(",\n");

const file = `import type { Product } from "./types";

export const MERCHANT_ID = "mer_circuit";
export const MERCHANT_NAME = "Circuit";

/**
 * Live Kreo catalog from the public Shopify feed (products.json).
 * Titles, photos, and INR prices are theirs. Circuit is the demo merchant on Razorpay test mode.
 */
export const PRODUCTS: Product[] = [
${items},
];

export function getProduct(sku: string): Product | undefined {
  return PRODUCTS.find((p) => p.sku === sku);
}

export function searchCatalog(query: string, budgetPaise?: number): Product[] {
  const q = query.toLowerCase().trim();
  if (!q) return PRODUCTS.slice(0, 8);

  const words = q.split(/\\s+/).filter(Boolean);
  const scored = PRODUCTS.map((p) => {
    const hay = \`\${p.name} \${p.short} \${p.details} \${p.category} \${p.tags.join(" ")}\`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (hay.includes(w)) score += 2;
      if (p.name.toLowerCase().includes(w)) score += 2;
    }
    if (budgetPaise && p.pricePaise > budgetPaise) score -= 2;
    if (/keyboard|hive|swarm|mechanical/.test(q) && p.category === "keyboard") score += 4;
    if (/mouse|harpy|anzu|chimera|dpi/.test(q) && p.category === "mouse") score += 4;
    if (/monitor|obsidian|1440|hz/.test(q) && p.category === "monitor") score += 4;
    if (/headphone|headset|mic|kast|sonik|beluga/.test(q) && p.category === "audio") score += 4;
    if (/controller|gamepad|surge|mirage/.test(q) && p.category === "controller") score += 4;
    if (/pad|deskmat|webcam|cooler|chair/.test(q) && p.category === "accessory") score += 4;
    return { p, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.pricePaise - b.p.pricePaise);

  return (scored.length ? scored.map((x) => x.p) : PRODUCTS.slice(0, 4)).slice(0, 8);
}

export function catalogFeed() {
  return {
    merchantId: MERCHANT_ID,
    merchantName: MERCHANT_NAME,
    protocol: "u402",
    currency: "INR",
    products: PRODUCTS.map((p) => ({
      "@type": "Product",
      sku: p.sku,
      name: p.name,
      description: p.details,
      category: p.category,
      image: p.image,
      offers: {
        "@type": "Offer",
        priceCurrency: "INR",
        price: (p.pricePaise / 100).toFixed(2),
        availability: "https://schema.org/InStock",
      },
      tags: p.tags,
    })),
  };
}
`;

writeFileSync(path.join(root, "src/lib/catalog.ts"), file);
const cats = {};
for (const p of products) cats[p.category] = (cats[p.category] || 0) + 1;
console.log(`Wrote ${products.length} SKUs`, cats);
console.log("handles", products.map((p) => p.sku).join("\n"));
