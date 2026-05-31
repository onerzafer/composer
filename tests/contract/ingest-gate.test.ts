// T018 / 003 Polish — The human gate, asserted mechanically (FR-004 / SC-004).
//
// Ingestion derivation may be automated, but *activation* (promote) is reachable
// ONLY by a human running the CLI. This test proves the load-bearing invariant:
// the agent (MCP) surface exposes NO `ingest` and NO `promote` tool, and is
// unchanged from the canonical 4-tool workflow set. There is no code path by
// which an agent triggers derivation or activation.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The canonical 4-tool workflow set (namespaced under `composer.`).
const CANONICAL_TOOLS = [
  "composer.discover",
  "composer.scaffold",
  "composer.validate",
  "composer.compose",
];

describe("Ingest gate — agent surface excludes ingest/promote (003 / FR-004 / SC-004)", () => {
  it("the canonical tool registry is exactly the 4 workflow tools", async () => {
    const { TOOLS } = await import("@composer/mcp");
    const names = TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([...CANONICAL_TOOLS].sort());
    // No tool — under any namespace — exposes ingestion or activation.
    expect(names.some((n) => /ingest|promote/i.test(n))).toBe(false);
  });

  it("a live server lists no ingest/promote tool", async () => {
    const { createServer } = await import("@composer/mcp");
    const cwd = mkdtempSync(join(tmpdir(), "composer-gate-"));
    try {
      const server = createServer({ cwd });
      const { tools } = await server.listTools();
      const names = tools.map((t) => t.name);
      expect(names.some((n) => /ingest|promote/i.test(n))).toBe(false);
      expect(names.sort()).toEqual([...CANONICAL_TOOLS].sort());
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("invoking `ingest` or `promote` over MCP is rejected as an unknown tool", async () => {
    const { createServer } = await import("@composer/mcp");
    const cwd = mkdtempSync(join(tmpdir(), "composer-gate-"));
    try {
      const server = createServer({ cwd });
      await expect(server.callTool("ingest", {})).rejects.toThrow(/UNKNOWN_TOOL/);
      await expect(server.callTool("promote", {})).rejects.toThrow(/UNKNOWN_TOOL/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
