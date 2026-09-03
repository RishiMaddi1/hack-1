/**
 * Human-style local smoke: chat, recommend quality, abandoned-email cheaper plan.
 * Run: npx tsx scripts/human-smoke-local.ts
 */
import { buildCheaperPlan } from "../src/lib/abandoned-cart";
import { getProduct, PRODUCTS, searchCatalog } from "../src/lib/catalog";
import { enrichFromSearch, pickPairs, pickUpgrade } from "../src/lib/recommend";
import { formatInr } from "../src/lib/money";
import { priceCart } from "../src/lib/quote";
import type { CartLine } from "../src/lib/types";

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function mcp(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = await res.json();
  const text = body?.result?.content?.[0]?.text;
  if (!text) throw new Error(`MCP ${name}: ${JSON.stringify(body).slice(0, 500)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function chat(token: string, text: string, history: unknown[] = []) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopper-Token": token,
    },
    body: JSON.stringify({ text, history }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`chat ${res.status}: ${JSON.stringify(body)}`);
  return body.message as {
    text: string;
    products?: Array<{ sku: string; name: string; pricePaise: number }>;
    upsell?: { sku: string; name: string; pricePaise: number; discountedPaise?: number };
    crossSell?: Array<{ sku: string; name: string; pricePaise: number }>;
    showCart?: boolean;
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK ${msg}`);
}

function shelf(p: { pricePaise: number; discountedPaise?: number }) {
  return p.discountedPaise ?? p.pricePaise;
}

async function main() {
  console.log("\n======== 1) Catalog typos (no brand tables) ========");
  for (const [q, expectCat] of [
    ["cotnroller", "controller"],
    ["kayboard", "keyboard"],
    ["gaming mouse", "mouse"],
    ["deskmat", "accessory"],
  ] as const) {
    const hits = searchCatalog(q);
    assert(hits.length > 0, `search "${q}" returns hits`);
    assert(
      hits[0]!.category === expectCat || hits.some((h) => h.category === expectCat),
      `search "${q}" → ${expectCat} (top=${hits[0]!.category}:${hits[0]!.sku})`,
    );
  }

  console.log("\n======== 2) Recommend: upgrade + pairs look sensible ========");
  const mouseHits = searchCatalog("gaming mouse");
  const sessionId = `smoke_${Date.now()}`;
  const enriched = enrichFromSearch(sessionId, mouseHits, "gaming mouse", 300_000);
  assert(enriched.products.length >= 1, `mouse search cards=${enriched.products.length}`);
  console.log(
    "  cards:",
    enriched.products.map((p) => `${p.name} ${formatInr(shelf(p))}`).join(" | "),
  );
  if (enriched.upsell) {
    const up = getProduct(enriched.upsell.sku)!;
    const seedCat = getProduct(enriched.products[0]!.sku)!.category;
    const maxMatch = Math.max(...enriched.products.map((p) => shelf(p)));
    assert(
      shelf(enriched.upsell) > maxMatch || up.category !== seedCat,
      `upsell ${enriched.upsell.name} (${formatInr(shelf(enriched.upsell))}) is step-up (>${formatInr(maxMatch)}) or cross-cat`,
    );
    console.log(`  upsell: ${enriched.upsell.name} ${formatInr(shelf(enriched.upsell))} [${up.category}]`);
  } else {
    console.log("  (no upsell under remaining — ok if mandate empty session)");
  }
  if (enriched.crossSell?.length) {
    for (const c of enriched.crossSell) {
      const cp = getProduct(c.sku)!;
      const seedCat = getProduct(enriched.products[0]!.sku)!.category;
      assert(cp.category !== seedCat, `pair ${c.name} is other category (${cp.category}≠${seedCat})`);
      assert(!/keychain/i.test(c.name), `pair is not junk keychain (${c.name})`);
      console.log(`  pair: ${c.name} ${formatInr(shelf(c))} [${cp.category}]`);
    }
  } else {
    console.log("  (no pairs — ok if no catalog upsell links under budget)");
  }

  // Controller search → pairs should prefer catalog upsellSku (mouse pad or mouse) not random junk
  const ctrlHits = searchCatalog("controller");
  const ctrlSeed = ctrlHits.filter((p) => p.category === "controller").slice(0, 3);
  const remaining = 2_000_000;
  const upgrade = pickUpgrade(ctrlSeed, remaining, "controller");
  const pairs = pickPairs(ctrlSeed, remaining, new Set());
  console.log(
    "  controller upgrade:",
    upgrade ? `${upgrade.name} ${formatInr(upgrade.pricePaise)}` : "(none)",
  );
  for (const p of pairs) {
    assert(p.category !== "controller", `controller pair is not another controller (${p.sku})`);
    assert(!/keychain/i.test(p.name), `controller pair not keychain (${p.name})`);
    console.log(`  controller pair: ${p.name} [${p.category}] ${formatInr(p.pricePaise)}`);
  }
  // If seed has upsellSku and it fits, first pair should be that companion when cross-cat
  const linked = ctrlSeed[0]?.upsellSku ? getProduct(ctrlSeed[0].upsellSku) : undefined;
  if (linked && linked.category !== "controller" && linked.pricePaise <= remaining) {
    assert(
      pairs[0]?.sku === linked.sku,
      `first controller pair is catalog upsellSku ${linked.sku} (got ${pairs[0]?.sku})`,
    );
  }

  console.log("\n======== 3) Abandoned email cheaper plan ========");
  const expensiveCtrl = PRODUCTS.filter((p) => p.category === "controller").sort(
    (a, b) => b.pricePaise - a.pricePaise,
  )[0]!;
  const expensiveKb = PRODUCTS.filter((p) => p.category === "keyboard").sort(
    (a, b) => b.pricePaise - a.pricePaise,
  )[0]!;
  const cart: CartLine[] = [
    { sku: expensiveCtrl.sku, qty: 1 },
    { sku: expensiveKb.sku, qty: 1 },
  ];
  const plan = buildCheaperPlan(cart);
  assert(Boolean(plan), "cheaper plan exists for expensive bag");
  assert(plan!.kind === "cheaper_swaps", `plan is cheaper_swaps (got ${plan!.kind})`);
  const orig = priceCart(cart).payablePaise;
  const next = priceCart(plan!.cart).payablePaise;
  assert(next < orig, `bill2 ${formatInr(next)} < bill1 ${formatInr(orig)}`);
  for (const line of plan!.cart) {
    const alt = getProduct(line.sku)!;
    const origLine = cart.find((c) => getProduct(c.sku)?.category === alt.category);
    const origP = origLine ? getProduct(origLine.sku)! : undefined;
    assert(Boolean(origP), `swap stays in category ${alt.category}`);
    assert(alt.pricePaise < origP!.pricePaise, `${alt.name} cheaper than ${origP!.name}`);
    console.log(
      `  swap ${origP!.name} ${formatInr(origP!.pricePaise)} → ${alt.name} ${formatInr(alt.pricePaise)}`,
    );
  }

  // Single item with no cheaper same-cat → null (can't trim to empty meaningfully for email)
  const cheapestMouse = PRODUCTS.filter((p) => p.category === "mouse").sort(
    (a, b) => a.pricePaise - b.pricePaise,
  )[0]!;
  const solo = buildCheaperPlan([{ sku: cheapestMouse.sku, qty: 1 }]);
  assert(solo === null, "cheapest solo mouse → no bill2 (nothing cheaper / can't trim)");

  // Two items, one already cheapest in cat → trim path may apply
  const cheapCtrl = PRODUCTS.filter((p) => p.category === "controller").sort(
    (a, b) => a.pricePaise - b.pricePaise,
  )[0]!;
  const trimCart: CartLine[] = [
    { sku: cheapCtrl.sku, qty: 1 },
    { sku: cheapestMouse.sku, qty: 1 },
  ];
  const trimPlan = buildCheaperPlan(trimCart);
  if (trimPlan) {
    assert(
      priceCart(trimPlan.cart).payablePaise < priceCart(trimCart).payablePaise,
      `trim/swap plan cheaper: ${formatInr(priceCart(trimPlan.cart).payablePaise)}`,
    );
    console.log(`  edge plan (${trimPlan.kind}): ${trimPlan.blurb}`);
    console.log(`  notes: ${trimPlan.notes.join(" · ")}`);
  }

  console.log("\n======== 4) Human chat against live server ========");
  const u = `human_${Date.now()}`;
  const reg = await mcp("register_shopper", { username: u });
  const tok = String(reg.shopperToken);
  await mcp("set_budget", { shopper_token: tok, max_rupees: 25000 });

  const history: Array<{ role: string; text: string; skus?: string[]; upsellSku?: string; pairSkus?: string[] }> =
    [];

  const turn = async (say: string) => {
    const msg = await chat(tok, say, history);
    console.log(`\n  YOU: ${say}`);
    console.log(`  BOT: ${msg.text}`);
    if (msg.products?.length) {
      console.log(
        `  cards: ${msg.products.map((p) => p.name).join(" · ")}`,
      );
    }
    if (msg.upsell) console.log(`  upsell: ${msg.upsell.name}`);
    if (msg.crossSell?.length) {
      console.log(`  pairs: ${msg.crossSell.map((p) => p.name).join(" · ")}`);
    }
    history.push({
      role: "user",
      text: say,
    });
    history.push({
      role: "assistant",
      text: msg.text,
      skus: msg.products?.map((p) => p.sku),
      upsellSku: msg.upsell?.sku,
      pairSkus: msg.crossSell?.map((p) => p.sku),
    });
    return msg;
  };

  const s1 = await turn("show me a wireless controller under 5k");
  assert((s1.products?.length || 0) >= 1, "showed controller cards");
  const cats1 = new Set(
    (s1.products || []).map((p) => getProduct(p.sku)?.category).filter(Boolean),
  );
  assert(cats1.has("controller"), "primary cards are controllers");
  if (s1.upsell) {
    const upCat = getProduct(s1.upsell.sku)?.category;
    console.log(`  (upsell lane=${upCat})`);
  }
  if (s1.crossSell?.length) {
    for (const c of s1.crossSell) {
      assert(
        getProduct(c.sku)?.category !== "controller",
        `live pair not another controller: ${c.name}`,
      );
    }
  }

  const s2 = await turn("add the first one to my bag");
  assert(/bag|added|now in/i.test(s2.text), "acknowledged add");
  const bag2 = ((await mcp("get_cart", { shopper_token: tok })).lines as Array<{ sku: string; name: string }>) || [];
  assert(bag2.length === 1, `ordinal add only 1 line (got ${bag2.length}: ${bag2.map((l) => l.name).join(", ")})`);
  const shownSkus = new Set((s1.products || []).map((p) => p.sku));
  assert(shownSkus.has(bag2[0]!.sku), `added one of the shown cards (got ${bag2[0]!.sku})`);
  // Prefer Match 1 when model follows ordinals — soft warn only in log if not
  if (bag2[0]!.sku !== s1.products![0]!.sku) {
    console.log(`  note: Match 1 was ${s1.products![0]!.sku}, model added ${bag2[0]!.sku} (still a shown card)`);
  }

  const s3 = await turn("also add a cheep kayboard");
  const cartAfterKb = await mcp("get_cart", { shopper_token: tok });
  const linesKb = (cartAfterKb.lines as Array<{ sku: string; name: string }>) || [];
  console.log(`  bag now: ${linesKb.map((l) => l.name).join(" · ") || "(empty)"}`);
  assert(
    linesKb.some((l) => /keyboard/i.test(l.name + l.sku)),
    "cheap kayboard was actually added to bag",
  );

  const s4 = await turn("whats in my bag");
  assert(/bag|cart|₹|inr|\d/i.test(s4.text) || (s4.products?.length || 0) > 0, "showed bag");

  const beforeRm = ((await mcp("get_cart", { shopper_token: tok })).lines as unknown[])?.length || 0;
  const s5 = await turn("remeve the cotnroller from my bag");
  const afterRm = ((await mcp("get_cart", { shopper_token: tok })).lines as unknown[])?.length || 0;
  assert(/removed/i.test(s5.text), "remove reply");
  assert(!/added/i.test(s5.text), "did not add on remove");
  assert(afterRm === beforeRm - 1 || afterRm < beforeRm, `cart shrank ${beforeRm}→${afterRm}`);

  await turn("add that mouse you suggested earlier if any");
  // Soft — may no-op if no mouse in memory

  console.log("\n======== ALL HUMAN SMOKE CHECKS PASSED ========\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
