// T028 — MCP `composer.discover` contract test (per contracts/mcp-tools.md).
// Includes G2 (analysis finding) — explicit SC-009 token-count assertion.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

describe("MCP composer.discover — response contract", () => {
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

  it("returns { project, primitives, specs, guidelines, tokens, catalog_version, suggested_next }", async () => {
    const { discover } = (await import("@composer/core")) as {
      discover?: (projectRoot: string) => Promise<Record<string, unknown>>;
    };
    if (!discover) throw new Error("discover() pending T040");

    const result = await discover(fixture.projectRoot);
    expect(result).toHaveProperty("project");
    expect(result).toHaveProperty("primitives");
    expect(result).toHaveProperty("specs");
    expect(result).toHaveProperty("guidelines");
    expect(result).toHaveProperty("tokens");
    expect(result).toHaveProperty("catalog_version");
    expect(result.suggested_next).toBe("scaffold");
  });

  it("primitives carry name + intent + whenToUse only (no full schemas — light overview)", async () => {
    const { discover } = (await import("@composer/core")) as {
      discover?: (projectRoot: string) => Promise<{ primitives: Record<string, unknown>[] }>;
    };
    if (!discover) throw new Error("discover() pending T040");

    const result = await discover(fixture.projectRoot);
    for (const p of result.primitives) {
      expect(p).toHaveProperty("name");
      expect(p).toHaveProperty("intent");
      expect(p).toHaveProperty("whenToUse");
      // NO schema in discover (FR-001 / FR-024 — light overview)
      expect(p).not.toHaveProperty("schema");
    }
  });

  it("[G2] discover response on the reference adapter is ≤ 5000 tokens (SC-009)", async () => {
    const { discover } = (await import("@composer/core")) as {
      discover?: (projectRoot: string) => Promise<unknown>;
    };
    if (!discover) throw new Error("discover() pending T040");

    const result = await discover(fixture.projectRoot);
    const serialized = JSON.stringify(result);
    // 4 chars per token is a reasonable conservative estimate for JSON content.
    const estimatedTokens = Math.ceil(serialized.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(5000);
  });
});
