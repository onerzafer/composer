// T027 — Mock-agent MCP harness.
//
// Simulates an LLM agent attaching via stdio MCP: requests `tools/list`,
// then drives `discover → scaffold → compose`. Validates the workflow-only
// contract — exactly 4 tools, no inspection escape hatches.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

describe("Mock MCP agent — workflow-only surface contract (FR-001/002)", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture({
      files: {
        "catalog/index.ts": STUB_CATALOG_INDEX,
        "templates/hero.ts.hbs": STUB_HERO_TEMPLATE,
        "output.map.ts": STUB_OUTPUT_MAP,
      },
    });
  });

  afterEach(() => fixture.cleanup());

  it("MCP server exposes EXACTLY 4 tools: discover, scaffold, validate, compose", async () => {
    const mcp = (await import("@composer/mcp")) as {
      createServer?: (opts: { cwd: string }) => { listTools: () => Promise<{ tools: { name: string }[] }> };
    };
    if (!mcp.createServer) throw new Error("createServer() pending T045");

    const server = mcp.createServer({ cwd: fixture.projectRoot });
    const list = await server.listTools();
    const names = list.tools.map((t) => t.name).sort();

    expect(names).toEqual([
      "composer.compose",
      "composer.discover",
      "composer.scaffold",
      "composer.validate",
    ]);
  });

  it("MCP server has NO inspection escape-hatch tools (no list_primitives, list_specs, read_template)", async () => {
    const mcp = (await import("@composer/mcp")) as {
      createServer?: (opts: { cwd: string }) => { listTools: () => Promise<{ tools: { name: string }[] }> };
    };
    if (!mcp.createServer) throw new Error("createServer() pending T045");

    const server = mcp.createServer({ cwd: fixture.projectRoot });
    const list = await server.listTools();
    const names = list.tools.map((t) => t.name);

    expect(names).not.toContain("composer.list_primitives");
    expect(names).not.toContain("composer.list_specs");
    expect(names).not.toContain("composer.read_template");
    expect(names).not.toContain("composer.read_spec");
    expect(names).not.toContain("composer.generate");
  });

  it("agent loop: discover → scaffold → compose succeeds end-to-end", async () => {
    const mcp = (await import("@composer/mcp")) as {
      createServer?: (opts: { cwd: string }) => {
        callTool: (name: string, args?: unknown) => Promise<unknown>;
      };
    };
    if (!mcp.createServer) throw new Error("createServer() pending T045");

    const server = mcp.createServer({ cwd: fixture.projectRoot });

    const discovered = (await server.callTool("composer.discover")) as {
      primitives: { name: string }[];
      suggested_next: string;
    };
    expect(discovered.primitives.map((p) => p.name)).toContain("Hero");
    expect(discovered.suggested_next).toBe("scaffold");

    const scaffolded = (await server.callTool("composer.scaffold", {
      kind: "primitive",
      primitive: "Hero",
      intent: "demo hero",
    })) as { skeleton: unknown; suggested_next: string };
    expect(scaffolded.skeleton).toBeDefined();
    expect(scaffolded.suggested_next).toBe("compose");

    const composed = (await server.callTool("composer.compose", {
      spec_id: "demo",
      json: { primitive: "Hero", id: "demo", title: "Hello" },
    })) as { spec_saved: string; files_written: unknown[] };
    expect(composed.spec_saved).toBeTruthy();
    expect(Array.isArray(composed.files_written)).toBe(true);
    expect(composed.files_written.length).toBeGreaterThan(0);
  });

  it("MCP server picks up a catalog edit between two discover calls, no restart (v0.2 deferral #5)", async () => {
    const mcp = (await import("@composer/mcp")) as {
      createServer?: (opts: { cwd: string }) => {
        callTool: (name: string, args?: unknown) => Promise<unknown>;
      };
    };
    if (!mcp.createServer) throw new Error("createServer() pending T045");

    // One long-lived server instance, mirroring a real MCP session that
    // stays attached across an editor session (no process restart).
    const server = mcp.createServer({ cwd: fixture.projectRoot });

    const before = (await server.callTool("composer.discover")) as {
      primitives: { name: string }[];
    };
    expect(before.primitives.map((p) => p.name)).toEqual(["Hero"]);

    // A human edits catalog/index.ts on disk — no restart of the MCP server.
    const edited = STUB_CATALOG_INDEX.replace(
      'export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero]);',
      [
        'export const Section = z.object({ primitive: z.literal("Section"), id: z.string() }).strict();',
        'export const SectionMeta = { primitive: "Section", version: "1.0.0", intent: "x", whenToUse: "x", whenNotToUse: [], fieldGuidance: {}, examples: [] } as const;',
        'export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero, Section]);',
      ].join("\n"),
    );
    writeFileSync(join(fixture.workspaceRoot, "catalog", "index.ts"), edited, "utf8");

    const after = (await server.callTool("composer.discover")) as {
      primitives: { name: string }[];
    };
    expect(after.primitives.map((p) => p.name).sort()).toEqual(["Hero", "Section"]);
  });
});
