// T050 — MCP tools aggregator.
//
// The 4-tool registry is the canonical list per FR-001 / contracts/mcp-tools.md.
// No additional tools are exposed (workflow-only — constitution principle IV).

import { discoverTool } from "./discover.js";
import { scaffoldTool } from "./scaffold.js";
import { validateTool } from "./validate.js";
import { composeTool } from "./compose.js";
import type { ToolDef } from "./types.js";

export const TOOLS: ToolDef[] = [discoverTool, scaffoldTool, validateTool, composeTool];

export type { ToolDef } from "./types.js";
