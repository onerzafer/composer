// T081 — Drift detection (US4 Acceptance #1, #2, #3 / SC-003).
//
// Three scenarios:
//   1. Idempotent no-op: re-compose with identical spec is a clean re-write.
//   2. Hand-edit detected: compose aborts with a diff + remediation options.
//   3. Workspace byte-identical on drift error: no spec saved, no file touched.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

describe("Drift detection (US4 / SC-003)", () => {
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

  it("US4 #1 — recompose with no spec change is a benign no-op", async () => {
    const { compose } = await import("@composer/core");
    const spec = { primitive: "Hero", id: "x", title: "Hello world" };

    const r1 = await compose(fixture.projectRoot, "page-1", spec);
    const outPath = join(fixture.projectRoot, r1.files_written[0]!.path);
    const before = readFileSync(outPath, "utf8");
    const beforeMtime = statSync(outPath).mtimeMs;

    const r2 = await compose(fixture.projectRoot, "page-1", spec);
    const after = readFileSync(outPath, "utf8");
    expect(after).toEqual(before);
    expect(r2.files_written).toHaveLength(1);
    // The second write should yield byte-identical content (file may still be
    // re-touched in v0.1 — we'll wire skip-write-on-no-diff in v0.2).
    expect(after).toEqual(before);
    // mtime may bump (v0.1 always rewrites); the content equality above is the
    // strong invariant.
    expect(typeof beforeMtime).toBe("number");
  });

  it("US4 #2 — hand-edited file detected; compose aborts with diff in error", async () => {
    const { compose } = await import("@composer/core");
    const spec = { primitive: "Hero", id: "x", title: "Original" };

    const r1 = await compose(fixture.projectRoot, "page-2", spec);
    const outPath = join(fixture.projectRoot, r1.files_written[0]!.path);

    // Simulate a hand-edit
    writeFileSync(outPath, "// hand-edited by a human\n", "utf8");

    await expect(
      compose(fixture.projectRoot, "page-2", { ...spec, title: "Changed" }),
    ).rejects.toThrow(/DRIFT_DETECTED|hand-edit/i);

    // The hand-edit must be preserved verbatim (US4 Acceptance #3).
    expect(readFileSync(outPath, "utf8")).toBe("// hand-edited by a human\n");
  });

  it("US4 #3 — drift error leaves workspace byte-identical", async () => {
    const { compose, DriftDetectedError } = (await import("@composer/core")) as {
      compose: typeof import("@composer/core")["compose"];
      DriftDetectedError: typeof import("@composer/core")["DriftDetectedError"];
    };
    const spec = { primitive: "Hero", id: "x", title: "Atomic" };
    await compose(fixture.projectRoot, "page-3", spec);

    const outPath = join(fixture.projectRoot, "src/heroes/x.ts");
    writeFileSync(outPath, "// drift", "utf8");

    const specBefore = readFileSync(
      join(fixture.workspaceRoot, "specs/page-3.json"),
      "utf8",
    );

    let caught: unknown = null;
    try {
      await compose(fixture.projectRoot, "page-3", { ...spec, title: "Different" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DriftDetectedError);

    // Spec file untouched on drift abort (atomic rollback semantics).
    expect(readFileSync(join(fixture.workspaceRoot, "specs/page-3.json"), "utf8")).toBe(
      specBefore,
    );
    // Hand-edit untouched.
    expect(readFileSync(outPath, "utf8")).toBe("// drift");
  });

  it("DriftDetectedError carries diff + remediation hint", async () => {
    const { compose, DriftDetectedError } = (await import("@composer/core")) as {
      compose: typeof import("@composer/core")["compose"];
      DriftDetectedError: typeof import("@composer/core")["DriftDetectedError"];
    };
    await compose(fixture.projectRoot, "diff", { primitive: "Hero", id: "x", title: "Original" });
    writeFileSync(join(fixture.projectRoot, "src/heroes/x.ts"), "// HUMAN", "utf8");

    let err: InstanceType<typeof DriftDetectedError> | null = null;
    try {
      await compose(fixture.projectRoot, "diff", { primitive: "Hero", id: "x", title: "Original" });
    } catch (e) {
      err = e as InstanceType<typeof DriftDetectedError>;
    }
    expect(err).not.toBeNull();
    expect(err!.issues).toHaveLength(1);
    expect(err!.issues[0]!.path).toBe("src/heroes/x.ts");
    expect(err!.issues[0]!.diff).toContain("- // HUMAN");
    expect(err!.message).toContain("git checkout");
  });
});
