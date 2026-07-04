// CLI `composer discover` / `composer scaffold` contract tests.
//
// These subcommands (packages/cli/src/commands/{discover,scaffold}.ts) mirror
// the MCP `composer.discover` / `composer.scaffold` tools
// (packages/mcp/src/tools/{discover,scaffold}.ts) so that agents shelling out
// over SSH (`composer discover --json`, `composer scaffold --json
// --primitive <name>`) get the identical JSON shape an MCP-attached agent
// would. Both surfaces call the same @composer/core entrypoint, so this test
// asserts the CLI command output is deep-equal to the MCP tool's handler
// output for the same fixture + input.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverCommand, scaffoldCommand } from "@composer/cli";
import { TOOLS } from "@composer/mcp";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

const discoverTool = TOOLS.find((t) => t.name === "composer.discover");
const scaffoldTool = TOOLS.find((t) => t.name === "composer.scaffold");
if (!discoverTool) throw new Error("composer.discover tool missing from @composer/mcp TOOLS");
if (!scaffoldTool) throw new Error("composer.scaffold tool missing from @composer/mcp TOOLS");

describe("CLI `composer discover` — JSON shape matches MCP composer.discover", () => {
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

  it("returns the same result as the MCP tool handler for the same project", async () => {
    const cliResult = await discoverCommand({ projectRoot: fixture.projectRoot });
    const mcpResult = await discoverTool.handler(fixture.projectRoot, {});

    expect(cliResult).toEqual(mcpResult);
    expect(cliResult).toHaveProperty("project");
    expect(cliResult).toHaveProperty("primitives");
    expect(cliResult).toHaveProperty("specs");
    expect(cliResult).toHaveProperty("guidelines");
    expect(cliResult).toHaveProperty("tokens");
    expect(cliResult).toHaveProperty("catalog_version");
    expect(cliResult.suggested_next).toBe("scaffold");
  });
});

describe("CLI `composer scaffold --primitive` — JSON shape matches MCP composer.scaffold (kind=primitive)", () => {
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

  it("returns the same result as the MCP tool handler for the same project + input", async () => {
    const cliResult = await scaffoldCommand({
      projectRoot: fixture.projectRoot,
      primitive: "Hero",
      intent: "demo hero",
    });
    const mcpResult = await scaffoldTool.handler(fixture.projectRoot, {
      kind: "primitive",
      primitive: "Hero",
      intent: "demo hero",
    });

    expect(cliResult).toEqual(mcpResult);
    expect(cliResult).toHaveProperty("skeleton");
    expect(cliResult).toHaveProperty("schema");
    expect(cliResult).toHaveProperty("field_guidance");
    expect(cliResult).toHaveProperty("when_not_to_use");
    expect(cliResult).toHaveProperty("examples");
    expect(cliResult.suggested_next).toBe("compose");
  });

  it("rejects an unknown primitive name the same way the MCP tool does", async () => {
    await expect(
      scaffoldCommand({ projectRoot: fixture.projectRoot, primitive: "Nonexistent" }),
    ).rejects.toThrow(/PRIMITIVE_NOT_FOUND|not found/i);
  });
});

describe("CLI `composer scaffold --spec` — JSON shape matches MCP composer.scaffold (kind=spec)", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture({
      files: {
        "catalog/index.ts": STUB_CATALOG_INDEX,
        "templates/hero.ts.hbs": STUB_HERO_TEMPLATE,
        "output.map.ts": STUB_OUTPUT_MAP,
      },
    });
    writeFileSync(
      join(fixture.workspaceRoot, "specs", "existing.json"),
      JSON.stringify({ primitive: "Hero", id: "existing", title: "Pre-existing" }, null, 2),
      "utf8",
    );
  });

  afterEach(() => fixture.cleanup());

  it("returns the same result as the MCP tool handler for the same project + input", async () => {
    const cliResult = await scaffoldCommand({
      projectRoot: fixture.projectRoot,
      specId: "existing",
    });
    const mcpResult = await scaffoldTool.handler(fixture.projectRoot, {
      kind: "spec",
      spec_id: "existing",
    });

    expect(cliResult).toEqual(mcpResult);
    expect((cliResult as { spec_id: string }).spec_id).toBe("existing");
    expect((cliResult as { suggested_next: string }).suggested_next).toBe("compose");
  });

  it("rejects an unknown spec_id the same way the MCP tool does", async () => {
    await expect(
      scaffoldCommand({ projectRoot: fixture.projectRoot, specId: "missing" }),
    ).rejects.toThrow(/SPEC_NOT_FOUND|not found/i);
  });

  it("requires either --primitive or --spec", async () => {
    await expect(
      scaffoldCommand({ projectRoot: fixture.projectRoot }),
    ).rejects.toThrow(/requires either --primitive|--spec/i);
  });
});
