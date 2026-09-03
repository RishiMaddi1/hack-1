/**
 * Strict human smoke: ordinals + weird typos + remove/add traps.
 * Run: npx tsx scripts/strict-smoke-local.ts
 */
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
  if (!text) throw new Error(`MCP ${name}: ${JSON.stringify(body).slice(0, 400)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function chat(
  token: string,
  text: string,
  history: Array<{
    role: string;
    text: string;
    skus?: string[];
    upsellSku?: string;
    pairSkus?: string[];
  }>,
) {
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
    products?: Array<{ sku: string; name: string }>;
    upsell?: { sku: string; name: string };
    crossSell?: Array<{ sku: string; name: string }>;
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK ${msg}`);
}

async function bag(token: string) {
  const g = await mcp("get_cart", { shopper_token: token });
  return (g.lines as Array<{ sku: string; name: string; qty: number }>) || [];
}

async function main() {
  const u = `strict_${Date.now()}`;
  console.log(`\n== register ${u} ==`);
  const reg = await mcp("register_shopper", { username: u });
  const tok = String(reg.shopperToken);
  await mcp("set_budget", { shopper_token: tok, max_rupees: 25000 });

  const history: Array<{
    role: string;
    text: string;
    skus?: string[];
    upsellSku?: string;
    pairSkus?: string[];
  }> = [];

  const turn = async (say: string) => {
    const msg = await chat(tok, say, history);
    console.log(`\n  YOU: ${say}`);
    console.log(`  BOT: ${msg.text.slice(0, 280)}`);
    if (msg.products?.length) console.log(`  cards: ${msg.products.map((p) => p.name).join(" · ")}`);
    history.push({ role: "user", text: say });
    history.push({
      role: "assistant",
      text: msg.text,
      skus: msg.products?.map((p) => p.sku),
      upsellSku: msg.upsell?.sku,
      pairSkus: msg.crossSell?.map((p) => p.sku),
    });
    return msg;
  };

  console.log("\n======== A) HARD: add the FIRST suggestion ========");
  const s1 = await turn("show me wireless controllers under 5k");
  assert((s1.products?.length || 0) >= 2, `got ≥2 cards (got ${s1.products?.length || 0})`);
  const match1 = s1.products![0]!;
  const match2 = s1.products![1]!;
  console.log(`  Match 1 must be: ${match1.name} [${match1.sku}]`);
  console.log(`  Match 2 (must NOT add): ${match2.name}`);

  const s2 = await turn("add the first one to my bag");
  let lines = await bag(tok);
  assert(lines.length === 1, `after first-one: exactly 1 line (got ${lines.length}: ${lines.map((l) => l.name).join(", ")})`);
  assert(lines[0]!.sku === match1.sku, `HARD ordinal: added Match 1 ${match1.sku} (got ${lines[0]!.sku})`);
  assert(lines[0]!.sku !== match2.sku, "did not add Match 2");
  assert(!/added .* \+ /i.test(s2.text) || lines.length === 1, "did not dump multiple adds in one ordinal");

  console.log("\n======== B) HARD: add the SECOND suggestion ========");
  // Clear via MCP then re-show same flow is heavy — instead ask for 2nd from same history cards
  await mcp("clear_cart", { shopper_token: tok }).catch(async () => {
    for (const l of await bag(tok)) {
      await mcp("remove_from_cart", { shopper_token: tok, sku: l.sku });
    }
  });
  // Re-seed suggestions by asking again so Match list is fresh
  const s3 = await turn("shwo me wireless cotnrollers plz");
  assert((s3.products?.length || 0) >= 2, "typo show still returned cards");
  const m1b = s3.products![0]!;
  const m2b = s3.products![1]!;
  await turn("put the 2nd suggested one in my cart");
  lines = await bag(tok);
  assert(lines.length === 1, `after 2nd: exactly 1 line (got ${lines.length})`);
  assert(lines[0]!.sku === m2b.sku, `HARD ordinal 2nd: ${m2b.sku} (got ${lines[0]!.sku}; Match1 was ${m1b.sku})`);

  console.log("\n======== C) WEIRD typos: cheap kayboard add ========");
  await turn("also add a cheep kayboard pls");
  lines = await bag(tok);
  assert(lines.some((l) => /keyboard/i.test(l.name + l.sku)), `kayboard typo added keyboard (bag: ${lines.map((l) => l.name).join(", ")})`);
  const beforeWeird = lines.length;

  console.log("\n======== D) WEIRD remove typos ========");
  await turn("i said remeve any oen cotnroller from my bag");
  lines = await bag(tok);
  assert(lines.length === beforeWeird - 1, `remove cut 1 line (${beforeWeird}→${lines.length})`);
  assert(!lines.some((l) => /controller|surge|mirage/i.test(l.sku + l.name)), "controller gone after cotnroller typo");
  assert(lines.some((l) => /keyboard/i.test(l.name + l.sku)), "keyboard still in bag");

  console.log("\n======== E) Trap: bag query must not add ========");
  const beforeBag = (await bag(tok)).length;
  await turn("whats in my bag");
  assert((await bag(tok)).length === beforeBag, "bag query did not change size");

  console.log("\n======== F) Trap: remove must not add ========");
  const beforeDrop = (await bag(tok)).length;
  await turn("drop the kayboard from cart");
  lines = await bag(tok);
  assert(lines.length === beforeDrop - 1 || lines.length < beforeDrop, `drop keyboard shrank bag (${beforeDrop}→${lines.length})`);
  assert(!lines.some((l) => /keyboard/i.test(l.name)), "keyboard removed via kayboard typo");

  console.log("\n======== G) Suggested mouse from earlier cards ========");
  // History still has pair mouse from earlier turns — ask to add it
  const beforeMouse = (await bag(tok)).length;
  await turn("add that mouse u sggested earlier");
  lines = await bag(tok);
  assert(lines.length === beforeMouse + 1, `mouse add grew bag (${beforeMouse}→${lines.length})`);
  assert(lines.some((l) => /mouse/i.test(l.name + l.sku)), "a mouse is in the bag");

  console.log("\n======== ALL STRICT SMOKE PASSED ========\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
