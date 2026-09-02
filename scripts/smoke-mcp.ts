/**
 * In-process integration checks for shopper + MCP + gates + audit chain.
 * Run: npx tsx scripts/smoke-mcp.mjs  (or .ts)
 */
import { runMcpTool } from "../src/lib/mcp/handlers.ts";
import { verifyAuditChain } from "../src/lib/audit.ts";
import { listMerchants } from "../src/lib/merchants.ts";

function parse(result: { content: Array<{ text: string }>; isError?: boolean }) {
  const text = result.content[0]?.text || "{}";
  return { isError: Boolean(result.isError), data: JSON.parse(text) as Record<string, unknown> };
}

async function main() {
  const fails: string[] = [];
  const ok = (name: string) => console.log(`PASS  ${name}`);
  const fail = (name: string, detail: string) => {
    fails.push(`${name}: ${detail}`);
    console.log(`FAIL  ${name} — ${detail}`);
  };

  const user = `smoke_${Date.now().toString(36)}`;

  // 1 merchants
  const merchants = listMerchants();
  if (merchants.some((m) => m.id === "mer_circuit")) ok("list_merchants");
  else fail("list_merchants", "no mer_circuit");

  // 2 register
  const reg = parse(await runMcpTool("register_shopper", { username: user }));
  if (!reg.isError && reg.data.shopperToken) ok("register_shopper");
  else fail("register_shopper", JSON.stringify(reg.data));

  const token = String(reg.data.shopperToken || "");

  // 3 duplicate username
  const dup = parse(await runMcpTool("register_shopper", { username: user }));
  if (dup.isError || dup.data.code === "USERNAME_TAKEN") ok("USERNAME_TAKEN");
  else fail("USERNAME_TAKEN", JSON.stringify(dup.data));

  // 4 cart before budget
  const early = parse(
    await runMcpTool("add_to_cart", {
      shopper_token: token,
      sku: "harpy-black-light-weight-rgb-gaming-mouse",
    }),
  );
  if (early.isError && String(early.data.code || early.data.error).includes("BUDGET")) {
    ok("BUDGET_REQUIRED on cart");
  } else fail("BUDGET_REQUIRED on cart", JSON.stringify(early.data));

  // 5 search allowed before budget
  const search = parse(
    await runMcpTool("search_catalog", { shopper_token: token, query: "harpy mouse" }),
  );
  if (!search.isError && Array.isArray(search.data.matches)) ok("search_catalog before budget");
  else fail("search_catalog before budget", JSON.stringify(search.data));

  // 6 set budget
  const budget = parse(
    await runMcpTool("set_budget", { shopper_token: token, max_rupees: 8000 }),
  );
  if (!budget.isError && budget.data.budget_set === true) ok("set_budget");
  else fail("set_budget", JSON.stringify(budget.data));

  // 7 add + quote
  const add = parse(
    await runMcpTool("add_to_cart", {
      shopper_token: token,
      sku: "harpy-black-light-weight-rgb-gaming-mouse",
    }),
  );
  if (!add.isError && add.data.ok) ok("add_to_cart");
  else fail("add_to_cart", JSON.stringify(add.data));

  const quote = parse(await runMcpTool("quote_checkout", { shopper_token: token }));
  if (
    !quote.isError &&
    quote.data.http_status === 402 &&
    quote.data.payment_link_url &&
    quote.data.order_id
  ) {
    ok("quote_checkout 402 + payment_link");
  } else fail("quote_checkout", JSON.stringify(quote.data));

  // 8 amount injection
  const inject = parse(
    await runMcpTool("quote_checkout", {
      shopper_token: token,
      amountPaise: 100,
    }),
  );
  if (inject.isError && inject.data.code === "AMOUNT_INJECTION") ok("amount injection blocked");
  else fail("amount injection blocked", JSON.stringify(inject.data));

  // 9 login restores
  const login = parse(
    await runMcpTool("login_shopper", { username: user, shopper_token: token }),
  );
  if (!login.isError && login.data.budget_set === true) ok("login_shopper");
  else fail("login_shopper", JSON.stringify(login.data));

  const cart = parse(await runMcpTool("get_cart", { shopper_token: token }));
  if (!cart.isError) ok("get_cart after login");
  else fail("get_cart after login", JSON.stringify(cart.data));

  // 10 audit chain
  const audit = parse(await runMcpTool("get_audit", { shopper_token: token }));
  const chain = verifyAuditChain();
  if (!audit.isError && chain.ok) ok(`audit chain OK (${chain.checked})`);
  else fail("audit chain", JSON.stringify({ audit: audit.data, chain }));

  // 11 bad token
  const bad = parse(await runMcpTool("get_cart", { shopper_token: "stk_bogus" }));
  if (bad.isError) ok("bad token rejected");
  else fail("bad token rejected", JSON.stringify(bad.data));

  console.log("\n---");
  if (fails.length) {
    console.log(`${fails.length} FAILED`);
    for (const f of fails) console.log(" •", f);
    process.exit(1);
  }
  console.log("All in-process checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
