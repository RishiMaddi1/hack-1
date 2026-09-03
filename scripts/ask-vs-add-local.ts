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
  console.log(`OK ${msg}`);
}

async function main() {
  const u = `ask_${Date.now()}`;
  const reg = await mcp("register_shopper", { username: u });
  const tok = String(reg.shopperToken);
  await mcp("set_budget", { shopper_token: tok, max_rupees: 25000 });

  const m1 = await chat(tok, "cheap mouses");
  console.log("browse:", m1.text.slice(0, 160));
  assert((await bag(tok)).length === 0, "browse did not add");
  assert(Boolean(m1.products?.length), "browse showed cards");

  const hist: unknown[] = [
    { role: "user", text: "cheap mouses" },
    {
      role: "assistant",
      text: m1.text,
      skus: m1.products?.map((p) => p.sku),
      upsellSku: m1.upsell?.sku,
      pairSkus: m1.crossSell?.map((p) => p.sku),
    },
  ];

  const m2 = await chat(tok, "tell me about the first one", hist);
  console.log("ask first:", m2.text.slice(0, 200));
  assert((await bag(tok)).length === 0, "ask-first did not add");

  hist.push(
    { role: "user", text: "tell me about the first one" },
    { role: "assistant", text: m2.text, skus: m2.products?.map((p) => p.sku) },
  );

  const m3 = await chat(tok, "whats the upgrade like", hist);
  console.log("ask upgrade:", m3.text.slice(0, 160));
  assert((await bag(tok)).length === 0, "ask-upgrade did not add");

  hist.push({ role: "user", text: "whats the upgrade like" }, { role: "assistant", text: m3.text });

  await chat(tok, "ok add the first one to my bag", hist);
  const lines = await bag(tok);
  console.log("after add:", lines.map((l) => l.name).join(" | "));
  assert(lines.length === 1, "explicit add → 1 line");
  assert(lines[0]!.sku === m1.products![0]!.sku, "explicit add → Match 1");
  console.log("ALL ASK-VS-ADD CHECKS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
