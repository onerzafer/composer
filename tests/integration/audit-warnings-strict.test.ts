// Regression test — audit *warnings* (as opposed to errors) were silently
// discarded: runAudit() only threw on `!result.ok`, and the orchestrator
// hardcoded `audit: { ok: true, warnings: [] }` on every successful compose.
// Since most audit rules WARN rather than error, this gutted the doctrine —
// a rule could flag a problem and nobody would ever see it.
//
// Covers:
//   1. A rule that emits only a warning (ok:true) surfaces it via validate().
//   2. The same warning surfaces via compose()'s `audit.warnings`.
//   3. `--strict` (compose's strict option) escalates that warning into an
//      audit failure — the compose is rejected, nothing is written.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditFailedError, compose, validate } from "@composer/core";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

// Project-level audit: flags any Hero titled "Warn Me" with a warning —
// never an error. Passes Zod, passes audit's `ok`, but should not be silent.
const PROJECT_AUDIT_SOURCE = `export default function projectAudit(ws) {
  const warnings = [];
  for (const spec of ws.specs) {
    const json = spec.json;
    if (json && json.primitive === "Hero" && json.title === "Warn Me") {
      warnings.push({
        path: \`specs/\${spec.id}.json\`,
        message: 'title "Warn Me" should be revisited',
      });
    }
  }
  return { ok: true, errors: [], warnings };
}
`;

const WARNING_SPEC = {
  primitive: "Hero",
  id: "warn-hero",
  title: "Warn Me",
};

describe("audit warnings — threaded end-to-end, escalated by --strict", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture({
      files: {
        "catalog/index.ts": STUB_CATALOG_INDEX,
        "templates/hero.ts.hbs": STUB_HERO_TEMPLATE,
        "output.map.ts": STUB_OUTPUT_MAP,
        "audit.ts": PROJECT_AUDIT_SOURCE,
      },
    });
  });

  afterEach(() => fixture.cleanup());

  it("validate() surfaces the audit warning without failing", async () => {
    const result = await validate(fixture.projectRoot, "warn-hero", WARNING_SPEC);

    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]!.message).toMatch(/Warn Me/);
  });

  it("compose() (non-strict) succeeds and surfaces the same warning on audit.warnings", async () => {
    const result = await compose(fixture.projectRoot, "warn-hero", WARNING_SPEC, {
      surface: "cli",
    });

    expect(result.audit.ok).toBe(true);
    expect(result.audit.warnings.length).toBe(1);
    expect(result.audit.warnings[0]!.message).toMatch(/Warn Me/);
    expect(result.files_written.length).toBeGreaterThan(0);
  });

  it("compose() with strict:true escalates the warning into an audit failure", async () => {
    await expect(
      compose(fixture.projectRoot, "warn-hero-strict", WARNING_SPEC, {
        surface: "cli",
        strict: true,
      }),
    ).rejects.toBeInstanceOf(AuditFailedError);

    // Nothing should have been written — the escalated failure aborts the
    // atomic compose just like a real audit error would.
    let composeErrors: { path: string | null; message: string }[] = [];
    try {
      await compose(fixture.projectRoot, "warn-hero-strict", WARNING_SPEC, {
        surface: "cli",
        strict: true,
      });
      throw new Error("compose() should have rejected under --strict");
    } catch (err) {
      if (!(err instanceof AuditFailedError)) throw err;
      composeErrors = err.result.errors;
    }
    expect(composeErrors.length).toBe(1);
    expect(composeErrors[0]!.message).toMatch(/Warn Me/);
  });
});
