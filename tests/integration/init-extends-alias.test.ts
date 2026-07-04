// T0XX — `composer init --extends <adapter>` resolves adapter-internal
// `@/*` tsconfig aliases (bug report: a bare workspace failed with
// `Cannot find package '@/core'` until someone hand-authored a tsconfig.json
// re-declaring the adapter's own aliases — see adapter-aliases.ts).
//
// Fixture: tests/fixtures/custom-adapter-alias/ declares `"@/*": ["catalog/*"]`
// in its OWN tsconfig.json and its catalog/index.ts imports a sibling helper
// via `@/core` instead of a plain relative `./core`.

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

function makeProjectWithAliasAdapter(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-init-alias-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      { name: "init-alias-fixture", version: "0.0.0", private: true, type: "module" },
      null,
      2,
    ),
    "utf8",
  );

  // Symlink tests/node_modules so `extends:` resolves both the alias adapter
  // and its own deps (zod, @composer/adapter-kit) without shelling out to npm.
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");

  // Materialize the alias adapter at node_modules/@composer-test/adapter-alias
  // — same overlay strategy as custom-adapter.test.ts's kv adapter.
  const installedAt = join(TESTS_NODE_MODULES, "@composer-test", "adapter-alias");
  if (!existsSync(installedAt)) {
    mkdirSync(dirname(installedAt), { recursive: true });
    cpSync(ALIAS_ADAPTER_DIR, installedAt, { recursive: true, dereference: true });
  }

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("composer init --extends resolves adapter-internal `@/*` aliases", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProjectWithAliasAdapter();
  });

  afterEach(() => project.cleanup());

  it(
    "bare workspace + alias-using adapter composes clean",
    { timeout: 60_000 },
    async () => {
      const { init } = await import("@composer/cli");

      const result = await init({
        projectRoot: project.projectRoot,
        extends: "@composer-test/adapter-alias",
      });

      expect(result.ok).toBe(true);

      // The copied catalog no longer contains the bare adapter-internal
      // alias — it was rewritten to a relative specifier at copy time.
      const copiedIndex = readFileSync(
        join(project.projectRoot, "design/catalog/index.ts"),
        "utf8",
      );
      expect(copiedIndex).not.toContain('"@/core"');
      expect(copiedIndex).toContain('from "./core.js"');
      expect(existsSync(join(project.projectRoot, "design/catalog/core.ts"))).toBe(true);

      // The bootstrap-seeded sample spec composed successfully — this is the
      // exact step that previously threw `Cannot find package '@/core'`.
      expect(result.sampleSpec).toBe("design/specs/welcome.json");
      expect(result.sampleOutput).toBe("notes/welcome.txt");
      const generated = readFileSync(
        join(project.projectRoot, "notes/welcome.txt"),
        "utf8",
      );
      expect(generated).toContain("Hello from an alias-using adapter.");
    },
  );

  it(
    "a second compose against the copied (alias-free) catalog also succeeds",
    { timeout: 60_000 },
    async () => {
      const { init } = await import("@composer/cli");
      const { compose } = await import("@composer/core");

      await init({
        projectRoot: project.projectRoot,
        extends: "@composer-test/adapter-alias",
      });

      const result = await compose(
        project.projectRoot,
        "second",
        { primitive: "Note", id: "second", body: "Another note." },
        { surface: "cli" },
      );

      expect(result.audit.ok).toBe(true);
      expect(result.files_written).toHaveLength(1);
      expect(result.files_written[0]!.path).toBe("notes/second.txt");
    },
  );
});
