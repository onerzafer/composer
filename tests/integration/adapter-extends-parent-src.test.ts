// Regression — `resolveAndCacheParent` must copy a parent adapter's `src/`
// tree alongside `catalog/`/`templates/`, and its process-local
// already-materialized guard must self-heal if the on-disk cache goes
// missing/incomplete after being recorded as materialized.
//
// Bug: a parent like `@sifir/design-system` ships `catalog/index.ts` that
// imports its actual primitive schemas via a relative `../src/catalog` path
// (see tests/fixtures/sifir-design-system-catalog/README.md for the real
// shape). `resolveAndCacheParent` materialized `catalog/` + `templates/` into
// `.composer/cache/parent/<name>/` but never `src/`, so the cached copy's
// `../src/catalog` import resolved to a directory that didn't exist —
// `compile-catalog` threw a module-not-found error even though the parent
// package installed under node_modules was perfectly intact. Worse, the
// process-local `MATERIALIZED` idempotence guard only tracked "have I copied
// this (cacheRoot, version) before?" in memory — once set, nothing made it
// re-verify the copy was actually complete, so even after fixing the copy
// list, an already-broken cache from an earlier bad materialization (or one
// wiped/corrupted externally) could never self-heal within the same process.
//
// Fixture: tests/fixtures/custom-adapter-srccatalog/ — a parent adapter
// structured exactly like @sifir/design-system: `catalog/index.ts` imports
// `Widget`/`WidgetMeta` from a sibling `../src/catalog/index.ts` (and
// `WIDGET_SLOTS` from `../src/slots.ts`) via plain relative imports.

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
const SRCCATALOG_ADAPTER_DIR = join(
  COMPOSER_ROOT,
  "tests",
  "fixtures",
  "custom-adapter-srccatalog",
);
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");
const EXTENDS_SPEC = "@composer-test/adapter-srccatalog@0";

function makeProject(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-extends-srccatalog-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: "x", version: "0.0.0", private: true, type: "module" }),
    "utf8",
  );
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");

  const installedAt = join(TESTS_NODE_MODULES, "@composer-test", "adapter-srccatalog");
  if (!existsSync(installedAt)) {
    mkdirSync(dirname(installedAt), { recursive: true });
    cpSync(SRCCATALOG_ADAPTER_DIR, installedAt, { recursive: true, dereference: true });
  }

  mkdirSync(join(projectRoot, "design", "specs"), { recursive: true });
  mkdirSync(join(projectRoot, "design", "templates"), { recursive: true });
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

describe("resolveAndCacheParent copies a parent's src/ tree (design-system shape)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProject();
  });

  afterEach(() => project.cleanup());

  it(
    "materializes src/ alongside catalog/ so ../src relative imports resolve",
    async () => {
      const { resolveAndCacheParent } = await import("@composer/core");
      const parent = resolveAndCacheParent(project.projectRoot, EXTENDS_SPEC);

      expect(parent.hasCatalog).toBe(true);
      expect(existsSync(join(parent.cacheRoot, "catalog", "index.ts"))).toBe(true);
      // The bug: this used to be missing entirely, breaking the cached
      // catalog's `../src/catalog` / `../src/slots` imports.
      expect(existsSync(join(parent.cacheRoot, "src", "catalog", "index.ts"))).toBe(true);
      expect(existsSync(join(parent.cacheRoot, "src", "slots.ts"))).toBe(true);
    },
  );

  it(
    "compose() succeeds end-to-end against a parent whose catalog imports ../src",
    { timeout: 60_000 },
    async () => {
      const { compose } = await import("@composer/core");
      const result = await compose(
        project.projectRoot,
        "w1",
        { primitive: "Widget", id: "w1", label: "Hello from src" },
        { surface: "cli" },
      );

      expect(result.files_written).toHaveLength(1);
      expect(result.files_written[0]!.path).toBe("widgets/w1.txt");
      const generated = readFileSync(
        join(project.projectRoot, result.files_written[0]!.path),
        "utf8",
      );
      expect(generated).toContain("Widget: Hello from src");
    },
  );

  it(
    "self-heals a cache that was recorded materialized but is missing on disk",
    async () => {
      const { resolveAndCacheParent } = await import("@composer/core");

      const first = resolveAndCacheParent(project.projectRoot, EXTENDS_SPEC);
      expect(existsSync(join(first.cacheRoot, "src", "catalog", "index.ts"))).toBe(true);

      // Simulate the cache going missing/incomplete after the in-memory
      // "already materialized" guard recorded it — e.g. `.composer/cache/`
      // cleaned externally, or an interrupted copy from an earlier run.
      // Nothing else in this process knows the guard's memory is now stale.
      rmSync(first.cacheRoot, { recursive: true, force: true });
      expect(existsSync(join(first.cacheRoot, "catalog", "index.ts"))).toBe(false);

      const second = resolveAndCacheParent(project.projectRoot, EXTENDS_SPEC);
      expect(second.hasCatalog).toBe(true);
      expect(existsSync(join(second.cacheRoot, "catalog", "index.ts"))).toBe(true);
      expect(existsSync(join(second.cacheRoot, "src", "catalog", "index.ts"))).toBe(true);
    },
  );
});
