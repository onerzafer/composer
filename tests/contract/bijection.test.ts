// T025 — Bijection / idempotence Quality Gate (constitution VIII, SC-008).
//
// Strict bijection (JSON → code → JSON) requires the ingestion side, which is
// v1.x scope. v0.1's bijection-equivalent is **idempotence**: composing the
// same spec twice with the same catalog/templates produces byte-identical
// output. Same drift-catching power; no ingestion required.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

describe("Bijection / idempotence — adapter-next primitives", () => {
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

  it("compose Hero twice → byte-identical output (idempotence per FR-016)", async () => {
    const { compose } = (await import("@composer/core")) as {
      compose?: (
        projectRoot: string,
        specId: string,
        json: unknown,
      ) => Promise<{ files_written: { path: string }[] }>;
    };
    if (!compose) {
      throw new Error("compose() not yet exported from @composer/core (pending T043).");
    }

    const spec = { primitive: "Hero", id: "demo", title: "Hello world" };

    const r1 = await compose(fixture.projectRoot, "demo", spec);
    const path1 = join(fixture.projectRoot, r1.files_written[0]!.path);
    const file1 = readFileSync(path1, "utf8");

    const r2 = await compose(fixture.projectRoot, "demo", spec);
    const path2 = join(fixture.projectRoot, r2.files_written[0]!.path);
    const file2 = readFileSync(path2, "utf8");

    expect(file2).toEqual(file1);
  });

  it("compose then change title then compose → different output but same shape", async () => {
    const { compose } = (await import("@composer/core")) as {
      compose?: (
        projectRoot: string,
        specId: string,
        json: unknown,
      ) => Promise<{ files_written: { path: string }[] }>;
    };
    if (!compose) {
      throw new Error("compose() not yet exported from @composer/core (pending T043).");
    }

    const r1 = await compose(fixture.projectRoot, "demo", {
      primitive: "Hero",
      id: "demo",
      title: "First",
    });
    const file1 = readFileSync(join(fixture.projectRoot, r1.files_written[0]!.path), "utf8");

    const r2 = await compose(fixture.projectRoot, "demo", {
      primitive: "Hero",
      id: "demo",
      title: "Second",
    });
    const file2 = readFileSync(join(fixture.projectRoot, r2.files_written[0]!.path), "utf8");

    expect(file1).toContain("First");
    expect(file2).toContain("Second");
    expect(file1).not.toEqual(file2);
  });
});
