import type { Product } from "./types";

export const MERCHANT_ID = "mer_mandi";
export const MERCHANT_NAME = "Mandi Coffee";

export const PRODUCTS: Product[] = [
  {
    sku: "cof-filter-250",
    name: "Filter coffee, 250g",
    short: "South Indian decoction blend for 4 cups.",
    details: "70/30 peaberry + chicory. Medium roast. Enough for a morning for four.",
    category: "coffee",
    pricePaise: 28900,
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?auto=format&fit=crop&w=800&q=80",
    tags: ["coffee", "filter", "south indian", "4 people", "breakfast"],
    upsellSku: "jag-organic",
  },
  {
    sku: "cof-filter-500",
    name: "Filter coffee, 500g",
    short: "Same blend, bigger tin.",
    details: "Week's worth of filter coffee. Sealed tin, stays fragrant.",
    category: "coffee",
    pricePaise: 49900,
    image:
      "https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80",
    tags: ["coffee", "filter", "family"],
    upsellSku: "fil-south",
  },
  {
    sku: "cof-arabica",
    name: "Arabica beans, 250g",
    short: "Single-origin pour-over beans.",
    details: "Washed arabica from Baba Budangiri. Bright, citrus, chocolate finish.",
    category: "coffee",
    pricePaise: 34900,
    image:
      "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=800&q=80",
    tags: ["coffee", "beans", "pour over", "arabica"],
    upsellSku: "mug-ceramic",
  },
  {
    sku: "cof-robusta",
    name: "Robusta, 250g",
    short: "Strong, crema-heavy espresso.",
    details: "Low-acid robusta for moka pots and cheap machines that still want body.",
    category: "coffee",
    pricePaise: 22900,
    image:
      "https://images.unsplash.com/photo-1495474470467-5d40a8e8c0c6?auto=format&fit=crop&w=800&q=80",
    tags: ["coffee", "espresso", "strong"],
    upsellSku: "bis-rusk",
  },
  {
    sku: "tea-masala",
    name: "Masala chai, 250g",
    short: "Cardamom-forward cutting chai.",
    details: "Assam leaf with crushed cardamom, ginger, cloves. Street-stall ratio.",
    category: "tea",
    pricePaise: 18900,
    image:
      "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=800&q=80",
    tags: ["tea", "chai", "masala"],
    upsellSku: "bis-osmania",
  },
  {
    sku: "tea-assam",
    name: "Assam CTC, 250g",
    short: "Everyday milk tea leaf.",
    details: "Broken orange pekoe. Takes milk and sugar without going thin.",
    category: "tea",
    pricePaise: 16900,
    image:
      "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=800&q=80",
    tags: ["tea", "assam", "ctc"],
  },
  {
    sku: "jag-organic",
    name: "Organic jaggery, 500g",
    short: "The right sweetener for filter coffee.",
    details: "Set jaggery from Kolhapur. Melts clean in decoction, no sulphur bite.",
    category: "pantry",
    pricePaise: 8500,
    image:
      "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80",
    tags: ["jaggery", "sweet", "coffee pair", "pantry"],
  },
  {
    sku: "bis-osmania",
    name: "Osmania biscuits, 200g",
    short: "Hyderabadi tea biscuit.",
    details: "Cardamom shortbread. Classic with Irani chai, works with filter too.",
    category: "pantry",
    pricePaise: 6500,
    image:
      "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80",
    tags: ["biscuit", "snack", "tea pair"],
  },
  {
    sku: "bis-rusk",
    name: "Coffee rusk, 200g",
    short: "Twice-baked, dunks without collapsing.",
    details: "Sourdough rusk. Built for decoction, not for looking pretty.",
    category: "pantry",
    pricePaise: 5500,
    image:
      "https://images.unsplash.com/photo-1598373182133-52452f7691ef?auto=format&fit=crop&w=800&q=80",
    tags: ["rusk", "biscuit", "coffee pair"],
  },
  {
    sku: "mil-toned",
    name: "Toned milk, 1L",
    short: "For kaapi and chai.",
    details: "UHT toned milk. Shelf-stable until opened.",
    category: "pantry",
    pricePaise: 6800,
    image:
      "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=800&q=80",
    tags: ["milk", "pantry"],
  },
  {
    sku: "sug-raw",
    name: "Raw sugar, 1kg",
    short: "Unrefined crystals.",
    details: "If jaggery is too much personality, this is the quieter option.",
    category: "pantry",
    pricePaise: 7200,
    image:
      "https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=800&q=80",
    tags: ["sugar", "pantry"],
  },
  {
    sku: "fil-south",
    name: "South Indian filter",
    short: "Brass drip filter, two-cup.",
    details: "Traditional davara filter. Upper and lower chamber, pierced plate.",
    category: "kit",
    pricePaise: 44900,
    image:
      "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80",
    tags: ["filter", "kit", "brass"],
  },
  {
    sku: "mug-ceramic",
    name: "Ceramic tumbler",
    short: "Hand-thrown, holds a davara pour.",
    details: "Speckled stoneware. Wide mouth, doesn't burn your hands.",
    category: "kit",
    pricePaise: 19900,
    image:
      "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=80",
    tags: ["mug", "tumbler", "kit"],
  },
  {
    sku: "hon-wild",
    name: "Wild honey, 250g",
    short: "Forest honey for cold brew.",
    details: "Unfiltered. Floral, not syrupy. Goes in iced coffee without vanishing.",
    category: "pantry",
    pricePaise: 24900,
    image:
      "https://images.unsplash.com/photo-1587049352851-8d4e89133924?auto=format&fit=crop&w=800&q=80",
    tags: ["honey", "pantry"],
  },
  {
    sku: "nut-cashew",
    name: "Cashews, 200g",
    short: "W240 whole cashews.",
    details: "Roasted, unsalted. Office-drawer snack.",
    category: "pantry",
    pricePaise: 27900,
    image:
      "https://images.unsplash.com/photo-1508061253366-f7da158b90d5?auto=format&fit=crop&w=800&q=80",
    tags: ["nuts", "cashew", "snack"],
  },
  {
    sku: "cho-dark",
    name: "Dark chocolate, 70%",
    short: "70% bar from Tamil cacao.",
    details: "Single-estate. Pairs with arabica, not with cutting chai.",
    category: "pantry",
    pricePaise: 14900,
    image:
      "https://images.unsplash.com/photo-1606312619070-d48b74317d44?auto=format&fit=crop&w=800&q=80",
    tags: ["chocolate", "snack"],
  },
  {
    sku: "spi-cardamom",
    name: "Green cardamom, 50g",
    short: "For chai and filter experiments.",
    details: "8mm pods, Kerala. Crush two into the upper chamber.",
    category: "pantry",
    pricePaise: 19900,
    image:
      "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=800&q=80",
    tags: ["spice", "cardamom", "chai"],
  },
  {
    sku: "water-glass",
    name: "Glass water bottle",
    short: "750ml, for cold brew.",
    details: "Borosilicate. Fridge overnight with coarse arabica.",
    category: "kit",
    pricePaise: 12900,
    image:
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80",
    tags: ["bottle", "kit", "cold brew"],
  },
  {
    sku: "kit-gift",
    name: "Festival hamper",
    short: "Coffee, jaggery, rusk, tumbler.",
    details: "Packed for gifting. Over a typical daily mandate on purpose.",
    category: "kit",
    pricePaise: 129900,
    image:
      "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=80",
    tags: ["gift", "hamper"],
  },
  {
    sku: "blend-pro",
    name: "Countertop blender",
    short: "The ₹2,499 mandate trap.",
    details: "Fine machine. Not what a ₹500 coffee mandate is for. Used to demo the gate.",
    category: "appliance",
    pricePaise: 249900,
    image:
      "https://images.unsplash.com/photo-1570222094114-d054a817e56b?auto=format&fit=crop&w=800&q=80",
    tags: ["blender", "appliance", "expensive"],
  },
];

export function getProduct(sku: string): Product | undefined {
  return PRODUCTS.find((p) => p.sku === sku);
}

export function searchCatalog(query: string, budgetPaise?: number): Product[] {
  const q = query.toLowerCase().trim();
  if (!q) return PRODUCTS.slice(0, 8);

  const words = q.split(/\s+/).filter(Boolean);
  const scored = PRODUCTS.map((p) => {
    const hay = `${p.name} ${p.short} ${p.details} ${p.category} ${p.tags.join(" ")}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (hay.includes(w)) score += 2;
      if (p.name.toLowerCase().includes(w)) score += 2;
    }
    if (budgetPaise && p.pricePaise > budgetPaise) score -= 1;
    if (/\b4\b|four|family/.test(q) && p.tags.includes("4 people")) score += 4;
    if (/coffee|kaapi|filter/.test(q) && p.category === "coffee") score += 2;
    if (/tea|chai/.test(q) && p.category === "tea") score += 2;
    if (/blender|mixie/.test(q) && p.sku === "blend-pro") score += 8;
    return { p, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.pricePaise - b.p.pricePaise);

  return (scored.length ? scored.map((x) => x.p) : PRODUCTS.slice(0, 4)).slice(0, 6);
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
