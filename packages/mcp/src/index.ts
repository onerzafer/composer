// @composer/mcp — stdio MCP server exposing 4 workflow tools.
//
// Programmatic API for in-process use (tests, custom embeddings) + stdio
// entrypoint via `composer-mcp` bin (production agent attach).

export {
  createServer,
  type ComposerMcpServer,
  type CreateServerOptions,
  type PublicToolInfo,
} from "./server.js";
export { TOOLS, type ToolDef } from "./tools/index.js";

export const MCP_SERVER_VERSION = "0.1.0-alpha.0";
