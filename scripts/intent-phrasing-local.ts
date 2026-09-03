/** Varied phrasing: ask/details must not add; clear cart intent must add. No push. */
const BASE = process.env.BASE_URL || "http://localhost:3000";

async function mcp(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const b = await r.json();
  return JSON.parse(b.result.content[0].text) as Record<string, unknown>;
}

async function chat(tok: string, text: string, history: unknown[] = []) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopper-Token": tok },
    body: JSON.stringify({ text, history }),
  });
  const b = await r.json();
  return b.message as {
    text: string;
    products?: Array<{ sku: string; name: string }>;
    upsell?: { sku: string };
    crossSell?: Array<{ sku: string }>;
  };
}

async function bag(tok: string) {
  const g = await mcp("get_cart", { shopper_token: tok });
  return (g.lines as Array<{ sku: string; name: string }>) || [];
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK ${msg}`);
}

async function main() {
  const u = `intent_${Date.now()}`;
  const reg = await mcp("register_shopper", { username: u });
  const tok = String(reg.shopperToken);
  await mcp("set_budget", { shopper_token: tok, max_rupees: 25000 });

  const history: unknown[] = [];
  const turn = async (say: string) => {
    const msg = await chat(tok, say, history);
    console.log(`\n  YOU: ${say}`);
    console.log(`  BOT: ${msg.text.slice(0, 140)}`);
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

  console.log("\n== browse / details (must NOT add) ==");
  const m1 = await turn("any decent cheap mice around?");
  assert((await bag(tok)).length === 0, "browse phrasing did not add");
  assert(Boolean(m1.products?.length), "still showed matches");
  const match1 = m1.products![0]!;

  await turn("can you explain the first option a bit more");
  assert((await bag(tok)).length === 0, "details phrasing did not add");

  await turn("how does that step up compare");
  assert((await bag(tok)).length === 0, "compare upgrade did not add");

  await turn("which one would you recommend for fps");
  assert((await bag(tok)).length === 0, "recommend question did not add");

  console.log("\n== clear cart intent (must ADD) ==");
  await turn("yeah go ahead and throw the first one in my bag");
  let lines = await bag(tok);
  assert(lines.length === 1, `bag has 1 after colloquial add (got ${lines.length})`);
  assert(lines[0]!.sku === match1.sku, "colloquial add hit Match 1");

  await mcp("clear_cart", { shopper_token: tok });
  // refresh suggestions
  const m2 = await turn("show me cheap mice again");
  assert((await bag(tok)).length === 0, "show again did not add");
  const m2first = m2.products![0]!;

  await turn("please put match 1 into the cart");
  lines = await bag(tok);
  assert(lines.length === 1, "put into cart added one");
  assert(lines[0]!.sku === m2first.sku, "put into cart = Match 1");

  console.log("\nALL INTENT PHRASING CHECKS PASSED\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
