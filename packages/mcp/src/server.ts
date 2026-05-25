// T045 — Composer MCP server.
//
// Exposes `createServer({ cwd })` for in-process use (tests) AND `start()`
// for the stdio production entrypoint. Both share one tool registry.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, type ToolDef } from "./tools/index.js";

export interface ComposerMcpServer {
  /** List exposed tools (in-process; mirrors what the agent sees in `tools/list`). */
  listTools(): Promise<{ tools: PublicToolInfo[] }>;
  /** Invoke a tool (in-process). */
  callTool(name: string, args?: unknown): Promise<unknown>;
  /** Wire stdio MCP transport and run forever. Used by the `composer-mcp` bin. */
  start(): Promise<void>;
}

export interface PublicToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CreateServerOptions {
  /** Project root directory. The server resolves the workspace by walking up. */
  cwd: string;
  /** Override the tool registry (test-only). Defaults to canonical TOOLS. */
  tools?: ToolDef[];
}

const SERVER_NAME = "@composer/mcp";
const SERVER_VERSION = "0.1.0-alpha.0";

export function createServer(opts: CreateServerOptions): ComposerMcpServer {
  const cwd = opts.cwd;
  const tools = opts.tools ?? TOOLS;
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  async function listTools(): Promise<{ tools: PublicToolInfo[] }> {
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  async function callTool(name: string, args?: unknown): Promise<unknown> {
    const tool = toolByName.get(name);
    if (!tool) {
      throw new Error(
        `UNKNOWN_TOOL: "${name}" is not a Composer MCP tool. ` +
          `Available: ${tools.map((t) => t.name).join(", ")}.`,
      );
    }
    return tool.handler(cwd, args ?? {});
  }

  async function start(): Promise<void> {
    const server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const list = await listTools();
      return { tools: list.tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await callTool(name, args);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
  }

  return { listTools, callTool, start };
}
