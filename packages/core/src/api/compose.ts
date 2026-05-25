// T043 — `compose()` endpoint (atomic; FR-003).
//
// Thin wrapper around orchestrateCompose with the surface defaulted to "cli".
// MCP server overrides surface="mcp" when invoking this on the agent's behalf.

import { orchestrateCompose, type ComposeResult } from "../pipeline/orchestrator.js";

export type { ComposeResult } from "../pipeline/orchestrator.js";

export async function compose(
  projectRoot: string,
  specId: string,
  json: unknown,
  options: { surface?: "mcp" | "cli" } = {},
): Promise<ComposeResult> {
  return orchestrateCompose({
    projectRoot,
    specId,
    json,
    surface: options.surface ?? "cli",
  });
}
