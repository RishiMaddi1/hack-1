import { NextResponse } from "next/server";
import { MCP_TOOL_DEFS, runMcpTool } from "@/lib/mcp/handlers";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { listMerchants } from "@/lib/merchants";

/**
 * Circuit u402 MCP HTTP surface (JSON-RPC + simple REST).
 * Same handlers as stdio — never a second money path.
 *
 * Claude Desktop / MCP Inspector can POST JSON-RPC:
 *   { "jsonrpc":"2.0","id":1,"method":"tools/list" }
 *   { "jsonrpc":"2.0","id":2,"method":"tools/call","params":{ "name":"register_shopper","arguments":{...} } }
 */
function checkSecret(request: Request): NextResponse | null {
  const secret = process.env.MCP_SHARED_SECRET;
  if (!secret) return null;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const header = request.headers.get("x-mcp-secret") || "";
  if (bearer !== secret && header !== secret) {
    return NextResponse.json({ error: "Unauthorized MCP client" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  return NextResponse.json({
    name: "circuit-u402",
    version: "0.2.0",
    protocol: "u402",
    description:
      "Razorpay merchant MCP — register shopper, set_budget, shop. Human pays Payment Link.",
    merchants: listMerchants(),
    tools: MCP_TOOL_DEFS,
    flow: ["register_shopper", "set_budget", "search_catalog", "add_to_cart", "quote_checkout"],
  });
}

export async function POST(request: Request) {
  const denied = checkSecret(request);
  if (denied) return denied;

  const limited = rateLimit(`mcp:${clientKey(request)}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  const body = (await request.json()) as {
    jsonrpc?: string;
    id?: string | number;
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown>; tool?: string; args?: Record<string, unknown> };
    tool?: string;
    arguments?: Record<string, unknown>;
  };

  // Simple REST: { tool, arguments }
  if (body.tool && !body.method) {
    const result = await runMcpTool(body.tool, body.arguments || {});
    return NextResponse.json(result, { status: result.isError ? 400 : 200 });
  }

  const id = body.id ?? 1;
  const method = body.method || "";

  if (method === "initialize") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "circuit-u402", version: "0.2.0" },
      },
    });
  }

  if (method === "notifications/initialized" || method === "ping") {
    return NextResponse.json({ jsonrpc: "2.0", id, result: {} });
  }

  if (method === "tools/list") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: MCP_TOOL_DEFS.map((t) => ({
          name: t.name,
          description: "description" in t ? t.description : t.name,
          inputSchema: t.inputSchema,
        })),
      },
    });
  }

  if (method === "tools/call") {
    const name = body.params?.name || body.params?.tool || "";
    const args = body.params?.arguments || body.params?.args || {};
    const result = await runMcpTool(name, args);
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: result.content,
        isError: result.isError || false,
      },
    });
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}
