import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    mcpServers: {
      "circuit-u402": {
        url: `${origin}/api/mcp`,
        transport: "http",
        description: "Circuit u402 — register shopper, set budget, shop on Razorpay test mode",
      },
    },
  });
}
