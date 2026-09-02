/**
 * Claude Desktop / local MCP stdio entry.
 * Usage: npm run mcp:stdio  (from repo root; Next not required for in-process tools)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MCP_TOOL_DEFS, runMcpTool } from "../src/lib/mcp/handlers";

const server = new McpServer({
  name: "circuit-u402",
  version: "0.2.0",
});

for (const def of MCP_TOOL_DEFS) {
  const shape: Record<string, z.ZodTypeAny> = {};
  const props = (def.inputSchema as { properties?: Record<string, { type?: string }> }).properties || {};
  const required = new Set((def.inputSchema as { required?: string[] }).required || []);
  for (const [key, schema] of Object.entries(props)) {
    let field: z.ZodTypeAny = schema.type === "number" ? z.number() : z.string();
    if (!required.has(key)) field = field.optional();
    shape[key] = field;
  }
  server.registerTool(
    def.name,
    {
      description: ("description" in def ? def.description : def.name) as string,
      inputSchema: shape,
    },
    async (args) => {
      const result = await runMcpTool(def.name, args as Record<string, unknown>);
      return {
        content: result.content,
        isError: result.isError,
      };
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
