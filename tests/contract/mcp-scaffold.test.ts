// T029 — MCP `composer.scaffold` contract test (both variants).

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

describe("MCP composer.scaffold — primitive variant", () => {
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

  it("returns { skeleton, schema, field_guidance, when_not_to_use, examples, suggested_next }", async () => {
    const { scaffold } = (await import("@composer/core")) as {
      scaffold?: (
        projectRoot: string,
        input: { kind: "primitive"; primitive: string; intent?: string },
      ) => Promise<Record<string, unknown>>;
    };
    if (!scaffold) throw new Error("scaffold() pending T041");

    const result = await scaffold(fixture.projectRoot, {
      kind: "primitive",
      primitive: "Hero",
      intent: "demo hero",
    });

    expect(result).toHaveProperty("skeleton");
    expect(result).toHaveProperty("schema");
    expect(result).toHaveProperty("field_guidance");
    expect(result).toHaveProperty("when_not_to_use");
    expect(result).toHaveProperty("examples");
    expect(result.suggested_next).toBe("compose");
  });

  it("rejects unknown primitive name with PRIMITIVE_NOT_FOUND", async () => {
    const { scaffold } = (await import("@composer/core")) as {
      scaffold?: (
        projectRoot: string,
        input: { kind: "primitive"; primitive: string },
      ) => Promise<unknown>;
    };
    if (!scaffold) throw new Error("scaffold() pending T041");

    await expect(
      scaffold(fixture.projectRoot, { kind: "primitive", primitive: "Nonexistent" }),
    ).rejects.toThrow(/PRIMITIVE_NOT_FOUND|not found/i);
  });
});

describe("MCP composer.scaffold — spec variant (existing-spec reader)", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture({
      files: {
        "catalog/index.ts": STUB_CATALOG_INDEX,
        "templates/hero.ts.hbs": STUB_HERO_TEMPLATE,
        "output.map.ts": STUB_OUTPUT_MAP,
      },
    });
    // Seed an existing spec under design/specs/existing.json
    writeFileSync(
      join(fixture.workspaceRoot, "specs", "existing.json"),
      JSON.stringify({ primitive: "Hero", id: "existing", title: "Pre-existing" }, null, 2),
      "utf8",
    );
  });

  afterEach(() => fixture.cleanup());

  it("returns full JSON content of an existing spec (no escape-hatch needed)", async () => {
    const { scaffold } = (await import("@composer/core")) as {
      scaffold?: (
        projectRoot: string,
        input: { kind: "spec"; spec_id: string },
      ) => Promise<{ json: unknown; spec_id: string; suggested_next: string }>;
    };
    if (!scaffold) throw new Error("scaffold() pending T041");

    const result = await scaffold(fixture.projectRoot, {
      kind: "spec",
      spec_id: "existing",
    });

    expect(result.spec_id).toBe("existing");
    expect(result.json).toEqual({
      primitive: "Hero",
      id: "existing",
      title: "Pre-existing",
    });
    expect(result.suggested_next).toBe("compose");
  });

  it("rejects unknown spec_id with SPEC_NOT_FOUND", async () => {
    const { scaffold } = (await import("@composer/core")) as {
      scaffold?: (
        projectRoot: string,
        input: { kind: "spec"; spec_id: string },
      ) => Promise<unknown>;
    };
    if (!scaffold) throw new Error("scaffold() pending T041");

    await expect(
      scaffold(fixture.projectRoot, { kind: "spec", spec_id: "missing" }),
    ).rejects.toThrow(/SPEC_NOT_FOUND|not found/i);
  });
});
