/**
 * Adversarial local tests: MCP cart + buyer chat remove/add confusion.
 * Run: npx tsx scripts/break-remove-local.ts
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
  if (!text) throw new Error(`MCP ${name} bad: ${JSON.stringify(body).slice(0, 400)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function chat(token: string, text: string) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopper-Token": token,
    },
    body: JSON.stringify({ text, history: [] }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`chat ${res.status}: ${JSON.stringify(body)}`);
  return body.message as { text: string };
}

async function cartLines(token: string) {
  const g = await mcp("get_cart", { shopper_token: token });
  const lines = (g.lines as Array<{ sku: string; name: string; qty: number }>) || [];
  return lines;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK ${msg}`);
}

async function main() {
  const u = `break_${Date.now()}`;
  console.log("\n== register + budget ==");
  const reg = await mcp("register_shopper", { username: u });
  const tok = String(reg.shopperToken);
  await mcp("set_budget", { shopper_token: tok, max_rupees: 25000 });

  const c1 = "surge-lite-white-premium-rgb-wired-gaming-controller";
  const c2 = "surge-pro-wireless-gaming-controller-with-tmr-joysticks";
  const kb = "hive75-v2-all-black-wired-mechanical-gaming-keyboard";
  const mouse = "harpy-black-light-weight-rgb-gaming-mouse";

  console.log("\n== MCP add two controllers + keyboard + mouse ==");
  await mcp("add_to_cart", { shopper_token: tok, sku: c1, qty: 1 });
  await mcp("add_to_cart", { shopper_token: tok, sku: c2, qty: 1 });
  await mcp("add_to_cart", { shopper_token: tok, sku: kb, qty: 1 });
  await mcp("add_to_cart", { shopper_token: tok, sku: mouse, qty: 1 });
  let lines = await cartLines(tok);
  assert(lines.length === 4, `cart has 4 lines (got ${lines.length})`);

  console.log("\n== MCP remove_from_cart one controller ==");
  await mcp("remove_from_cart", { shopper_token: tok, sku: c1 });
  lines = await cartLines(tok);
  assert(lines.length === 3, `after MCP remove: 3 lines (got ${lines.length})`);
  assert(!lines.some((l) => l.sku === c1), "c1 gone");

  console.log("\n== CHAT: remove any one controller from my bag (typos) ==");
  const before = (await cartLines(tok)).length;
  const controllerBefore = (await cartLines(tok)).filter((l) =>
    /controller|surge/i.test(l.sku + l.name),
  ).length;
  const r1 = await chat(tok, "i said remove any oen cotnroller from my bag");
  console.log("  reply:", r1.text);
  lines = await cartLines(tok);
  const controllerAfter = lines.filter((l) => /controller|surge/i.test(l.sku + l.name)).length;
  assert(lines.length === before - 1, `remove cut exactly 1 (was ${before}, now ${lines.length})`);
  assert(controllerAfter === controllerBefore - 1, "removed a controller (not keyboard/mouse)");
  assert(!/added/i.test(r1.text), "reply must not say Added");
  assert(/removed/i.test(r1.text), "reply says Removed");
  assert(/controller/i.test(r1.text), "reply names a controller");

  console.log("\n== CHAT: drop the keyboard ==");
  const r2 = await chat(tok, "drop the keyboard");
  console.log("  reply:", r2.text);
  lines = await cartLines(tok);
  assert(!lines.some((l) => l.sku === kb), "keyboard removed");
  assert(!/added/i.test(r2.text), "no Added on drop");

  console.log("\n== CHAT: delete mouse from bag ==");
  const r3 = await chat(tok, "delete mouse from bag");
  console.log("  reply:", r3.text);
  lines = await cartLines(tok);
  assert(!lines.some((l) => l.sku.includes("harpy")), "mouse gone");
  assert(lines.every((l) => l.sku.includes("controller") || l.sku.includes("surge")), "only controllers left or empty-ish");

  console.log("\n== CHAT trap: bag word alone must not add (show cart) ==");
  const nBefore = (await cartLines(tok)).length;
  const r4 = await chat(tok, "what's in my bag");
  console.log("  reply:", r4.text.slice(0, 120));
  lines = await cartLines(tok);
  assert(lines.length === nBefore, `bag query did not change cart size (${nBefore})`);

  console.log("\n== CHAT trap: remove with empty-ish then re-add path ==");
  await mcp("clear_cart", { shopper_token: tok });
  await mcp("add_to_cart", { shopper_token: tok, sku: c2, qty: 1 });
  const r5 = await chat(tok, "remove controller from my bag please");
  console.log("  reply:", r5.text);
  lines = await cartLines(tok);
  assert(lines.length === 0, "last controller removed, cart empty");
  assert(!/added/i.test(r5.text), "did not add on last remove");

  console.log("\n== HTTP cart qty 0 (minus from 1) ==");
  await mcp("add_to_cart", { shopper_token: tok, sku: mouse, qty: 1 });
  const setRes = await fetch(`${BASE}/api/cart`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopper-Token": tok },
    body: JSON.stringify({ action: "set", sku: mouse, qty: 0 }),
  });
  const setBody = await setRes.json();
  assert(setRes.ok, `set qty0 http ${setRes.status}`);
  assert((setBody.priced?.lines?.length ?? 0) === 0, "qty0 cleared mouse line");

  console.log("\nALL BREAK TESTS PASSED\n");
}

main().catch((e) => {
  console.error("\nBROKEN:", e);
  process.exit(1);
});
