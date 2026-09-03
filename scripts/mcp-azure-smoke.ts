/**
 * Full MCP smoke against live Azure Circuit.
 * Usage: npx tsx scripts/mcp-azure-smoke.ts
 */
const BASE =
  process.env.MCP_BASE_URL ||
  "https://circuit-rishi-g9cxfud2ancddpbt.centralindia-01.azurewebsites.net";

async function rpc(method: string, params?: Record<string, unknown>, id = 1) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON ${res.status}: ${text.slice(0, 200)}`);
  }
  return { status: res.status, json };
}

async function callTool(name: string, args: Record<string, unknown>, id: number) {
  return rpc("tools/call", { name, arguments: args }, id);
}

function parseToolContent(json: any): any {
  const content = json?.result?.content?.[0]?.text;
  if (!content) return json;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK  ${msg}`);
}

async function main() {
  console.log(`MCP base: ${BASE}\n`);

  const init = await rpc("initialize");
  assert(init.status === 200 && (init.json as any)?.result?.serverInfo?.name === "circuit-u402", "initialize");

  const list = await rpc("tools/list", undefined, 2);
  const tools = (list.json as any)?.result?.tools || [];
  assert(tools.length >= 10, `tools/list count=${tools.length}`);
  const names = tools.map((t: { name: string }) => t.name);
  for (const n of [
    "register_shopper",
    "set_budget",
    "search_catalog",
    "add_to_cart",
    "quote_checkout",
    "get_audit",
  ]) {
    assert(names.includes(n), `has tool ${n}`);
  }

  const username = `mcp_${Date.now().toString(36).slice(-8)}`;
  const reg = await callTool("register_shopper", { username }, 3);
  const regBody = parseToolContent(reg.json);
  const token = String(regBody?.shopperToken || regBody?.shopper_token || "");
  assert(token, `register_shopper → token (${username}): ${JSON.stringify(regBody).slice(0, 200)}`);

  const noBudget = await callTool(
    "add_to_cart",
    { shopper_token: token, sku: "harpy-white-light-weight-rgb-gaming-mouse", qty: 1 },
    4,
  );
  const noBudgetBody = parseToolContent(noBudget.json);
  assert(
    noBudgetBody?.error === "BUDGET_REQUIRED" ||
      noBudgetBody?.code === "BUDGET_REQUIRED" ||
      String(noBudgetBody?.message || noBudgetBody?.error || "").toLowerCase().includes("budget"),
    `add_to_cart without budget blocked: ${JSON.stringify(noBudgetBody).slice(0, 160)}`,
  );

  const budget = await callTool("set_budget", { shopper_token: token, max_rupees: 8000 }, 5);
  const budgetBody = parseToolContent(budget.json);
  assert(
    budgetBody?.ok || budgetBody?.budget_set || budgetBody?.max_inr || budgetBody?.mandate,
    `set_budget: ${JSON.stringify(budgetBody).slice(0, 200)}`,
  );

  const search = await callTool(
    "search_catalog",
    { shopper_token: token, query: "harpy mouse", budget_rupees: 1000 },
    6,
  );
  const searchBody = parseToolContent(search.json);
  const products = searchBody?.matches || searchBody?.products || searchBody?.results || [];
  assert(Array.isArray(products) && products.length > 0, `search_catalog hits=${products.length} body=${JSON.stringify(searchBody).slice(0, 200)}`);
  const sku =
    products.find((p: { sku?: string }) => String(p.sku || "").includes("harpy"))?.sku ||
    products[0]?.sku;
  assert(sku, `picked sku=${sku}`);

  const add = await callTool("add_to_cart", { shopper_token: token, sku, qty: 1 }, 7);
  const addBody = parseToolContent(add.json);
  assert(
    !addBody?.isError && (!addBody?.error || addBody?.ok || addBody?.cart || addBody?.lines),
    `add_to_cart: ${JSON.stringify(addBody).slice(0, 200)}`,
  );

  const cart = await callTool("get_cart", { shopper_token: token }, 8);
  const cartBody = parseToolContent(cart.json);
  const lines = cartBody?.lines || cartBody?.cart || [];
  assert(lines.length > 0 || cartBody?.lineCount > 0, `get_cart has lines: ${JSON.stringify(cartBody).slice(0, 200)}`);

  const quote = await callTool("quote_checkout", { shopper_token: token }, 9);
  const quoteBody = parseToolContent(quote.json);
  const accepts = quoteBody?.accepts || [];
  const link =
    quoteBody?.payment_link_url ||
    quoteBody?.paymentLinkUrl ||
    accepts[0]?.paymentLinkUrl;
  const orderId =
    quoteBody?.order_id ||
    quoteBody?.orderId ||
    accepts[0]?.orderId;
  const status402 =
    quoteBody?.error === "payment_required" ||
    quoteBody?.http_status === 402 ||
    quoteBody?.httpStatus === 402;
  assert(
    status402 || orderId,
    `quote_checkout 402/order: ${JSON.stringify(quoteBody).slice(0, 500)}`,
  );
  console.log(`\nOrder: ${orderId || "(none)"}`);
  console.log(`Payment link: ${link || "(none — Checkout.js path still valid)"}`);
  console.log(`http_status: ${quoteBody?.http_status ?? quoteBody?.httpStatus ?? "?"}`);
  console.log(`payable_inr: ${quoteBody?.payable_inr ?? "?"}`);
  if (accepts[0]) {
    console.log(`Amount paise: ${accepts[0].amountPaise}`);
    console.log(`Network: ${accepts[0].network}`);
  }

  const audit = await callTool("get_audit", { shopper_token: token, limit: 10 }, 10);
  const auditBody = parseToolContent(audit.json);
  assert(
    Array.isArray(auditBody?.events) || auditBody?.chain != null,
    `get_audit: ${JSON.stringify(auditBody).slice(0, 200)}`,
  );

  console.log("\n=== MCP FULL FLOW PASSED ===");
  console.log(`Shopper: ${username}`);
  console.log(`Token: ${token.slice(0, 12)}…`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
