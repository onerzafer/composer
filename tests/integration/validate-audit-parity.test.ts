// Regression test — validate() must run the real project audit chain
// (adapter+project, with sibling specs loaded) instead of the no-op
// `runAudit([], { specs: [] })` it was previously wired with. That no-op
// meant validate() silently reported ok:true for specs that compose() would
// have rejected on audit.
//
// Covers:
//   1. A spec that passes Zod (structural+semantic) but fails a project
//      audit.ts rule → validate() must surface it as an error.
//   2. Parity — validate() and compose() must report the same audit error
//      for the same bad spec (same path/message shape).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditFailedError, compose, validate } from "@composer/core";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

// Project-level audit: rejects any Hero whose title is the literal string
// "Banned" — passes Zod (min(1) satisfied) but must fail audit.
const PROJECT_AUDIT_SOURCE = `export default function projectAudit(ws) {
  const errors = [];
  for (const spec of ws.specs) {
    const json = spec.json;
    if (json && json.primitive === "Hero" && json.title === "Banned") {
      errors.push({
        path: \`specs/\${spec.id}.json\`,
        message: 'title "Banned" is not allowed',
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors, warnings: [] };
  return { ok: true, errors: [], warnings: [] };
}
`;

const BAD_SPEC = {
  primitive: "Hero",
  id: "bad-hero",
  title: "Banned",
};

describe("validate() audit-chain wiring (regression)", () => {
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

  it("reports an audit error for a spec that passes Zod but fails audit.ts", async () => {
    const result = await validate(fixture.projectRoot, "bad-hero", BAD_SPEC);

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /not allowed/.test(e.message))).toBe(true);
  });

  it("does not flag a spec that satisfies the audit rule", async () => {
    const result = await validate(fixture.projectRoot, "good-hero", {
      primitive: "Hero",
      id: "good-hero",
      title: "Welcome",
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("parity: validate() and compose() surface the identical audit error for the same bad spec", async () => {
    const validateResult = await validate(fixture.projectRoot, "bad-hero", BAD_SPEC);
    expect(validateResult.ok).toBe(false);

    let composeErrors: { path: string | null; message: string }[] = [];
    try {
      await compose(fixture.projectRoot, "bad-hero", BAD_SPEC, { surface: "cli" });
      throw new Error("compose() should have rejected on audit failure");
    } catch (err) {
      if (!(err instanceof AuditFailedError)) throw err;
      composeErrors = err.result.errors;
    }

    expect(composeErrors.length).toBeGreaterThan(0);
    expect(validateResult.errors.length).toBe(composeErrors.length);
    expect(validateResult.errors[0]!.message).toBe(composeErrors[0]!.message);
    expect(validateResult.errors[0]!.path).toBe(composeErrors[0]!.path);
  });
});
