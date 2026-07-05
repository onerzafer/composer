// T085 — `composer explain` integration (US5 #1, SC-005).
//
// After a compose, the persisted sourcemap must let us locate
// (spec_id, spec_line, primitive, node_id) from a (file, line) in generated code.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeFixture,
  makeNextProjectFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

describe("composer explain (US5 #1, SC-005)", () => {
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

  it("explainAt resolves a generated-file line back to its spec node", async () => {
    const { compose, loadSourceMap, explainAt } = await import("@composer/core");
    await compose(fixture.projectRoot, "exp", { primitive: "Hero", id: "abc", title: "X" });

    const sm = loadSourceMap(fixture.workspaceRoot);
    const entries = sm.by_file["src/heroes/abc.ts"];
    expect(entries).toBeDefined();
    expect(entries!.length).toBeGreaterThan(0);

    // Look up the first recorded line within the generated file.
    const firstLine = entries![0]!.line_start;
    const found = explainAt(sm, "src/heroes/abc.ts", firstLine);
    expect(found).not.toBeNull();
    expect(found!.spec_id).toBe("exp");
    expect(found!.primitive).toBe("Hero");
    expect(found!.node_id).toBe("abc");
  });

  it("returns null for a file not in the source map", async () => {
    const { loadSourceMap, explainAt } = await import("@composer/core");
    const sm = loadSourceMap(fixture.workspaceRoot);
    expect(explainAt(sm, "src/heroes/never-generated.ts", 1)).toBeNull();
  });
});

describe("provenance id for id-less primitives (e.g. Page, identified by slug)", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeNextProjectFixture();
  });

  afterEach(() => fixture.cleanup());

  it("threads the Page's slug through as its node_id instead of falling back to \"unknown\"", async () => {
    const { compose, loadSourceMap } = await import("@composer/core");
    await compose(fixture.projectRoot, "pricing", {
      primitive: "Page",
      slug: "pricing",
      title: "Pricing",
      tree: [{ primitive: "Hero", id: "pricing-hero", variant: "centered", title: "Pricing" }],
    });

    const sm = loadSourceMap(fixture.workspaceRoot);
    const entries = sm.by_file["src/app/pricing/page.tsx"];
    expect(entries).toBeDefined();
    expect(entries!.length).toBeGreaterThan(0);
    expect(entries![0]!.spec_id).toBe("pricing");
    expect(entries![0]!.node_id).toBe("pricing");
    expect(entries![0]!.node_id).not.toBe("unknown");

    const generated = readFileSync(
      join(fixture.projectRoot, "src/app/pricing/page.tsx"),
      "utf8",
    );
    expect(generated).toContain("id=pricing");
    expect(generated).not.toContain("id=unknown");
  });
});
