// Regression — an adapter's own `@/*`-style tsconfig alias must resolve even
// when the alias TARGET lives in the adapter's sibling `src/` tree, not just
// inside catalog/templates/output.map.ts/audit.ts.
//
// Bug: 005361c taught `resolveAndCacheParent` to copy a parent adapter's
// `src/` tree alongside `catalog/` (see adapter-extends-parent-src.test.ts),
// which fixed PLAIN relative imports like `../src/catalog`. But
// `rewriteAdapterAliases`'s allow-list (`VALID_TARGET_ROOTS` /
// `VALID_TARGET_FILES` in adapter-aliases.ts) was never widened to match:
// it still only accepted alias targets resolving inside
// catalog/templates/output.map.ts/audit.ts. An adapter whose OWN `@/*` alias
// (e.g. `@/registry/*` declared in the adapter's own tsconfig.json) resolves
// into its sibling `src/` — the exact shape @sifir/design-system ships, its
// catalog pulling primitive schemas via `@/registry/*` — therefore still
// threw "outside catalog/templates/output.map.ts/audit.ts" at compose time,
// even though `src/` now sits right there in the materialized cache.
//
// Fixture: tests/fixtures/custom-adapter-srcalias/ — catalog/index.ts
// imports `Widget`/`WidgetMeta` from `@/registry/foo.js` (an alias resolving
// to `src/registry/foo.ts`, declared in the fixture's own tsconfig.json)
// alongside a plain relative `../src/slots.js` import, so this test also
// proves the two import styles keep working side by side.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSER_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SRCALIAS_ADAPTER_DIR = join(COMPOSER_ROOT, "tests", "fixtures", "custom-adapter-srcalias");
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");
const EXTENDS_SPEC = "@composer-test/adapter-srcalias@0";

function makeProject(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-extends-srcalias-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: "x", version: "0.0.0", private: true, type: "module" }, null, 2),
    "utf8",
  );
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");

  const installedAt = join(TESTS_NODE_MODULES, "@composer-test", "adapter-srcalias");
  if (!existsSync(installedAt)) {
    mkdirSync(dirname(installedAt), { recursive: true });
    cpSync(SRCALIAS_ADAPTER_DIR, installedAt, { recursive: true, dereference: true });
  }

  // Project has NO catalog/templates/output.map/audit of its own — relies
  // entirely on the parent via `extends:` (US3 Acceptance #1), matching the
  // external-consumer shape this bug only reproduces under.
  mkdirSync(join(projectRoot, "design", "specs"), { recursive: true });
  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify(
      {
        workspace: "./design",
        engine: "@composer/typescript@1",
        extends: EXTENDS_SPEC,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("adapter-internal alias resolving into src/ resolves via extends: (parent-layering)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProject();
  });

  afterEach(() => project.cleanup());

  it(
    "compose succeeds against an adapter whose alias resolves into its sibling src/ tree",
    { timeout: 60_000 },
    async () => {
      const { compose } = await import("@composer/core");

      const result = await compose(
        project.projectRoot,
        "w1",
        { primitive: "Widget", id: "w1", label: "Hello from a src-resolving alias" },
        { surface: "cli" },
      );

      expect(result.audit.ok).toBe(true);
      expect(result.files_written).toHaveLength(1);
      const out = result.files_written[0]!;
      expect(out.path).toBe("widgets/w1.txt");

      const generated = readFileSync(join(project.projectRoot, out.path), "utf8");
      expect(generated).toContain("Hello from a src-resolving alias");
    },
  );
});
