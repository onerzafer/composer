// T082 — Idempotence (FR-016): identical spec → byte-identical output.

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

describe("Idempotence (FR-016)", () => {
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

  it("two composes of the same spec produce byte-identical output", async () => {
    const { compose } = await import("@composer/core");
    const spec = { primitive: "Hero", id: "iso", title: "Same input → same output" };

    const r1 = await compose(fixture.projectRoot, "iso", spec);
    const file1 = readFileSync(join(fixture.projectRoot, r1.files_written[0]!.path), "utf8");

    const r2 = await compose(fixture.projectRoot, "iso", spec);
    const file2 = readFileSync(join(fixture.projectRoot, r2.files_written[0]!.path), "utf8");

    expect(file2).toEqual(file1);
    expect(r2.files_written[0]!.hash).toEqual(r1.files_written[0]!.hash);
  });

  it("composing with re-ordered (but equivalent) JSON keys is still idempotent", async () => {
    const { compose } = await import("@composer/core");
    const r1 = await compose(fixture.projectRoot, "keyorder", {
      primitive: "Hero",
      id: "a",
      title: "Hello",
    });
    const r2 = await compose(fixture.projectRoot, "keyorder", {
      title: "Hello",
      primitive: "Hero",
      id: "a",
    });
    const f1 = readFileSync(join(fixture.projectRoot, r1.files_written[0]!.path), "utf8");
    const f2 = readFileSync(join(fixture.projectRoot, r2.files_written[0]!.path), "utf8");
    expect(f2).toEqual(f1);
  });
});
