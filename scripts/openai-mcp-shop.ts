/**
 * OpenAI tool-calling shopper against Circuit MCP handlers.
 * Goal: register → set_budget → shop → spit payment link.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { MCP_TOOL_DEFS, runMcpTool } from "../src/lib/mcp/handlers.ts";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        if (!process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "").trim();
      }
    } catch {
      /* missing */
    }
  }
}

loadEnv();

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("No OPENAI_API_KEY");
  process.exit(1);
}

const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
const username = `oai_${Date.now().toString(36).slice(-8)}`;

const tools = MCP_TOOL_DEFS.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: ("description" in t ? t.description : t.name) as string,
    parameters: t.inputSchema,
  },
}));

type Msg = {
  role: string;
  content?: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

const messages: Msg[] = [
  {
    role: "system",
    content: `You are an AI shopper for Circuit (Razorpay test merchant) via MCP tools.
Rules:
1) Call register_shopper with username "${username}".
2) Save shopper_token from the result — pass it on EVERY later tool call.
3) Call set_budget with max_rupees 8000.
4) search_catalog for a cheap mouse (harpy), then add_to_cart that sku qty 1.
5) Call quote_checkout (no amount args).
6) When you have payment_link_url, stop and reply with ONLY that URL on one line, plus order_id on the next line.
Never invent prices or amounts. Never pass amount/price fields to quote_checkout.`,
  },
  {
    role: "user",
    content: `Register as ${username}, set budget ₹8000, buy one Harpy mouse, and give me the Razorpay buy/payment link.`,
  },
];

async function chat() {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  return (await res.json()) as { choices: Array<{ message: Msg }> };
}

console.log(`Model: ${model}`);
console.log(`Username: ${username}`);
console.log("---");

async function main() {
  for (let turn = 0; turn < 10; turn++) {
    const data = await chat();
    const msg = data.choices[0]?.message;
    if (!msg) throw new Error("No message");

    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        console.log(`→ ${call.function.name}`, JSON.stringify(args).slice(0, 120));
        const result = await runMcpTool(call.function.name, args);
        const text = result.content[0]?.text || "{}";
        console.log(`← ${result.isError ? "ERR" : "ok"}`, text.slice(0, 180).replace(/\s+/g, " "));
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: text,
        });
      }
      continue;
    }

    console.log("---");
    console.log("AGENT FINAL:");
    console.log(msg.content?.trim() || "(empty)");
    return;
  }

  console.log("Hit tool-loop limit without a final answer.");
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
