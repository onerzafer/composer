// T086 — `composer trace` integration (US5 #2).
//
// Given a (spec_id, spec_line), find every output span generated from it.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

describe("composer trace (US5 #2)", () => {
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

  it("traceFrom returns the generated output span for a known spec line", async () => {
    const { compose, loadSourceMap, traceFrom } = await import("@composer/core");
    await compose(fixture.projectRoot, "tr", { primitive: "Hero", id: "z", title: "trace me" });
    const sm = loadSourceMap(fixture.workspaceRoot);

    // The render phase records spans keyed by `<spec_id>:<spec_line>`. Find any
    // line that exists in by_spec for this spec_id.
    const key = Object.keys(sm.by_spec).find((k) => k.startsWith("tr:"));
    expect(key).toBeDefined();
    const line = Number(key!.split(":")[1]);
    const spans = traceFrom(sm, "tr", line);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0]!.file).toBe("src/heroes/z.ts");
  });

  it("returns empty array for a spec line with no recorded span", async () => {
    const { loadSourceMap, traceFrom } = await import("@composer/core");
    const sm = loadSourceMap(fixture.workspaceRoot);
    expect(traceFrom(sm, "nothing", 9999)).toEqual([]);
  });
});
