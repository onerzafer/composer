// T074 — Audit chain across parent + project (US3 Acceptance #3).
//
// When both the parent adapter and the project ship an `audit.ts`, both run
// during compose — parent first, project second. A failure from either aborts
// the pipeline and leaves the workspace byte-identical.
//
// Setup: re-use the custom-adapter-keyvalue fixture as the parent (its audit
// enforces unique Config names) and add a project-side audit that requires all
// values to start with a digit.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSER_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const KV_ADAPTER_DIR = join(COMPOSER_ROOT, "tests", "fixtures", "custom-adapter-keyvalue");
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");

const PROJECT_AUDIT_SOURCE = `// project-side audit — every value must begin with a digit
export default function projectAudit(ws) {
  const errors = [];
  for (const spec of ws.specs) {
    const json = spec.json;
    if (json && json.primitive === "Config" && Array.isArray(json.values)) {
      for (const v of json.values) {
        if (!/^[0-9]/.test(v.value)) {
          errors.push({
            spec_id: spec.id,
            path: \`specs/\${spec.id}.json\`,
            message: \`value "\${v.value}" must begin with a digit\`,
          });
        }
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors, warnings: [] };
  return { ok: true, errors: [], warnings: [] };
}
`;

function makeProject(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-audit-chain-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: "x", version: "0.0.0", private: true, type: "module" }),
    "utf8",
  );
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");

  // Install kv adapter into tests/node_modules (idempotent).
  const kvInstalled = join(TESTS_NODE_MODULES, "@composer-test", "adapter-keyvalue");
  if (!existsSync(kvInstalled)) {
    mkdirSync(dirname(kvInstalled), { recursive: true });
    cpSync(KV_ADAPTER_DIR, kvInstalled, { recursive: true, dereference: true });
  }

  mkdirSync(join(projectRoot, "design", "specs"), { recursive: true });
  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify(
      {
        workspace: "./design",
        engine: "@composer/typescript@1",
        extends: "@composer-test/adapter-keyvalue@0",
      },
      null,
      2,
    ),
    "utf8",
  );

  // Project audit lives at <workspace>/audit.ts.
  writeFileSync(join(projectRoot, "design", "audit.ts"), PROJECT_AUDIT_SOURCE, "utf8");

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("Adapter audit chain (US3 Acceptance #3)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProject();
  });

  afterEach(() => project.cleanup());

  it(
    "parent audit + project audit both pass when neither rule is violated",
    { timeout: 60_000 },
    async () => {
      const { compose } = await import("@composer/core");
      const result = await compose(
        project.projectRoot,
        "valid",
        {
          primitive: "Config",
          id: "valid",
          name: "ok",
          values: [{ key: "PORT", value: "3000" }],
        },
        { surface: "cli" },
      );
      expect(result.audit.ok).toBe(true);
    },
  );

  it(
    "project audit failure aborts compose (project rule runs even when parent passes)",
    { timeout: 60_000 },
    async () => {
      const { compose } = await import("@composer/core");
      await expect(
        compose(
          project.projectRoot,
          "bad-value",
          {
            primitive: "Config",
            id: "bad-value",
            name: "fresh",
            // Parent's audit (unique names) passes; project's (digit-first) fails.
            values: [{ key: "GREETING", value: "hello" }],
          },
          { surface: "cli" },
        ),
      ).rejects.toThrow(/must begin with a digit|AUDIT_FAILED/);

      expect(
        existsSync(join(project.projectRoot, "design/specs/bad-value.json")),
      ).toBe(false);
    },
  );
});
