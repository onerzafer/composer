// T023 / 004 Polish — grammar-kit adds NOTHING to the composer MCP/agent surface
// (FR-005 / SC-004). The guided authoring workflow is authoring-time AI skills +
// composer CLI; the runtime agent's tool set stays exactly the 4 workflow tools.
// This is the mechanical proof that "extend the vocabulary" never became an
// agent capability — only a human `promote` changes the grammar.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANONICAL_TOOLS = [
  "composer.discover",
  "composer.scaffold",
  "composer.validate",
  "composer.compose",
];

describe("Grammar gate — agent surface unchanged by grammar-kit (004 / FR-005 / SC-004)", () => {
  it("the MCP tool registry is still exactly the 4 workflow tools", async () => {
    const { TOOLS } = await import("@composer/mcp");
    const names = TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([...CANONICAL_TOOLS].sort());
    // No authoring/activation tool under any namespace.
    expect(names.some((n) => /grammar|author|promote|ingest|clarify/i.test(n))).toBe(false);
  });

  it("a live server exposes no grammar/author/promote tool", async () => {
    const { createServer } = await import("@composer/mcp");
    const cwd = mkdtempSync(join(tmpdir(), "composer-grammar-gate-"));
    try {
      const server = createServer({ cwd });
      const { tools } = await server.listTools();
      const names = tools.map((t) => t.name);
      expect(names.sort()).toEqual([...CANONICAL_TOOLS].sort());
      expect(names.some((n) => /grammar|author|promote/i.test(n))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("invoking a grammar/author/promote tool over MCP is rejected as unknown", async () => {
    const { createServer } = await import("@composer/mcp");
    const cwd = mkdtempSync(join(tmpdir(), "composer-grammar-gate-"));
    try {
      const server = createServer({ cwd });
      await expect(server.callTool("grammar", {})).rejects.toThrow(/UNKNOWN_TOOL/);
      await expect(server.callTool("grammar.author", {})).rejects.toThrow(/UNKNOWN_TOOL/);
      await expect(server.callTool("promote", {})).rejects.toThrow(/UNKNOWN_TOOL/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
