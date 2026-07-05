// Bug: an adapter's own `@/*`-style tsconfig alias (declared in its OWN
// tsconfig.json) breaks `compose()` when the adapter is adopted via
// `extends:` (parent-layering — see workspace/extends.ts + layer.ts) rather
// than copied once by `composer init --extends` (see adapter-aliases.ts /
// init-extends-alias.test.ts, which already covered the copy-time case).
//
// `resolveAndCacheParent` materializes the adapter's catalog/templates/
// output.map/audit into `.composer/cache/parent/<safeName>/` on EVERY
// compose, verbatim — the copy carries the bare `@/core` alias as-is, and
// nothing rewrites it. tsx's `tsImport` does not apply tsconfig `paths`
// remapping for the copy (no tsconfig.json is materialized into the cache,
// and even if one were, tsx refuses `paths` aliasing for any importer whose
// resolved URL sits under a `node_modules` segment) — so composing against
// an externally-installed alias-using adapter previously failed outright
// with `Cannot find package '@/core'` for every spec (US3 external-consumer
// parity blocker).
//
// Fixture: tests/fixtures/custom-adapter-alias/ — same fixture
// init-extends-alias.test.ts uses, plus an added audit.ts that imports the
// identical `@/core` alias, so this test also proves the audit-loading call
// site (audit-loader.ts) resolves the alias, not just the catalog loader.

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
const ALIAS_ADAPTER_DIR = join(COMPOSER_ROOT, "tests", "fixtures", "custom-adapter-alias");
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");

function makeProjectExtendingAliasAdapter(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-extends-alias-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      { name: "extends-alias-fixture", version: "0.0.0", private: true, type: "module" },
      null,
      2,
    ),
    "utf8",
  );

  // Same overlay strategy as custom-adapter.test.ts's kv adapter: symlink
  // tests/node_modules (zod + @composer/adapter-kit), then drop the alias
  // adapter alongside it so `extends:` resolves it via Node's real resolver
  // — an installed-under-node_modules adapter, exactly the external-consumer
  // shape this bug only reproduces under.
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");

  // Installed under a name distinct from init-extends-alias.test.ts's own
  // `@composer-test/adapter-alias` copy — both files share `tests/node_modules`
  // and vitest runs test files concurrently, so reusing that exact key races
  // two workers' check-then-`cpSync` on the same directory (EEXIST).
  const installedAt = join(TESTS_NODE_MODULES, "@composer-test", "adapter-alias-extends");
  if (!existsSync(installedAt)) {
    mkdirSync(dirname(installedAt), { recursive: true });
    cpSync(ALIAS_ADAPTER_DIR, installedAt, { recursive: true, dereference: true });
  }

  // Project has NO catalog/templates/output.map/audit of its own — relies
  // entirely on the parent via `extends:` (US3 Acceptance #1).
  mkdirSync(join(projectRoot, "design", "specs"), { recursive: true });
  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify(
      {
        workspace: "./design",
        engine: "@composer/typescript@1",
        extends: "@composer-test/adapter-alias-extends@0",
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

describe("adapter-internal `@/*` alias resolves via extends: (parent-layering)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProjectExtendingAliasAdapter();
  });

  afterEach(() => project.cleanup());

  it(
    "compose succeeds against an alias-using adapter loaded via extends (not init --extends copy)",
    { timeout: 60_000 },
    async () => {
      const { compose } = await import("@composer/core");

      const result = await compose(
        project.projectRoot,
        "hello",
        { primitive: "Note", id: "hello", body: "Hello from an alias-using adapter." },
        { surface: "cli" },
      );

      expect(result.audit.ok).toBe(true);
      expect(result.files_written).toHaveLength(1);
      const out = result.files_written[0]!;
      expect(out.path).toBe("notes/hello.txt");

      const generated = readFileSync(join(project.projectRoot, out.path), "utf8");
      expect(generated).toContain("Hello from an alias-using adapter.");
    },
  );
});
