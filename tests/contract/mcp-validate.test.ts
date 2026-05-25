// T030 — MCP `composer.validate` contract test (preview-only, side-effect-free).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

describe("MCP composer.validate — preview only (FR-004)", () => {
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

  it("returns { ok, errors, warnings, would_write, suggested_next }", async () => {
    const { validate } = (await import("@composer/core")) as {
      validate?: (
        projectRoot: string,
        specId: string,
        json: unknown,
      ) => Promise<Record<string, unknown>>;
    };
    if (!validate) throw new Error("validate() pending T042");

    const result = await validate(fixture.projectRoot, "demo", {
      primitive: "Hero",
      id: "demo",
      title: "Hello",
    });

    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("warnings");
    expect(result).toHaveProperty("would_write");
    expect(result).toHaveProperty("suggested_next");
  });

  it("does NOT write any files (side-effect-free)", async () => {
    const { validate } = (await import("@composer/core")) as {
      validate?: (projectRoot: string, specId: string, json: unknown) => Promise<unknown>;
    };
    if (!validate) throw new Error("validate() pending T042");

    const specPath = join(fixture.workspaceRoot, "specs", "demo.json");
    const outputPath = join(fixture.projectRoot, "src", "heroes", "demo.ts");

    await validate(fixture.projectRoot, "demo", {
      primitive: "Hero",
      id: "demo",
      title: "Hello",
    });

    expect(existsSync(specPath)).toBe(false);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("does NOT acquire the compose lock (FR-CONC-004)", async () => {
    const { validate } = (await import("@composer/core")) as {
      validate?: (projectRoot: string, specId: string, json: unknown) => Promise<unknown>;
    };
    if (!validate) throw new Error("validate() pending T042");

    const lockPath = join(fixture.projectRoot, ".composer", "cache", "compose.lock");

    await validate(fixture.projectRoot, "demo", {
      primitive: "Hero",
      id: "demo",
      title: "Hello",
    });

    expect(existsSync(lockPath)).toBe(false);
  });

  it("returns ok=false with structured errors on validation failure", async () => {
    const { validate } = (await import("@composer/core")) as {
      validate?: (
        projectRoot: string,
        specId: string,
        json: unknown,
      ) => Promise<{ ok: boolean; errors: { path: string; message: string }[] }>;
    };
    if (!validate) throw new Error("validate() pending T042");

    const result = await validate(fixture.projectRoot, "broken", {
      primitive: "Hero",
      id: "broken",
      // Missing required `title`
    });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!).toHaveProperty("path");
    expect(result.errors[0]!).toHaveProperty("message");
  });
});
