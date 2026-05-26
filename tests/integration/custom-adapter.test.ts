// T076 — Custom adapter end-to-end (US3 SC-004).
//
// Hand-authored "keyvalue" adapter (see tests/fixtures/custom-adapter-keyvalue/)
// — single `Config` primitive, emits .env-style files — adopted by a project
// via `extends:`. Proves the extends-resolution + parent-layering + audit chain
// work end-to-end for a non-Next.js, non-reference adapter.

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
const KV_ADAPTER_DIR = join(COMPOSER_ROOT, "tests", "fixtures", "custom-adapter-keyvalue");
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");

function makeProjectWithKvAdapter(): {
  projectRoot: string;
  cleanup: () => void;
} {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-kv-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      { name: "kv-fixture", version: "0.0.0", private: true, type: "module" },
      null,
      2,
    ),
    "utf8",
  );

  // Symlink tests/node_modules to give the fixture access to zod + adapter-kit,
  // and then drop the kv adapter into node_modules so `extends:` can resolve it
  // via the same Node resolver path that real users would hit after `npm install`.
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");

  // Materialize the kv adapter at node_modules/@composer-test/adapter-keyvalue
  // by overlaying a new dir on top of the symlinked node_modules. We have to
  // unlink the symlink and replace it with a real directory containing both
  // the symlinked entries AND the kv adapter — simplest: cp the kv adapter
  // into a separate real dir, then chain-load via NODE_PATH? No — easier:
  // install the kv adapter into the existing pnpm-managed tests/node_modules
  // by writing a sibling entry there. tests/ already declares the kv adapter
  // location via the path, but it's not a pnpm dep, so we write it manually:
  const kvInstalledAt = join(TESTS_NODE_MODULES, "@composer-test", "adapter-keyvalue");
  if (!existsSync(kvInstalledAt)) {
    mkdirSync(dirname(kvInstalledAt), { recursive: true });
    // The kv adapter's source-shape is the same as a published package — copy
    // it wholesale. (CI: cleaned up after the test.)
    cpSync(KV_ADAPTER_DIR, kvInstalledAt, { recursive: true, dereference: true });
  }

  // Set extends in composer.json. Project workspace has NO catalog/templates of
  // its own — it relies entirely on the parent (US3 Acceptance #1's "use parent
  // when project doesn't override" case).
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

  return {
    projectRoot,
    cleanup: () => {
      rmSync(projectRoot, { recursive: true, force: true });
      // Leave kvInstalledAt in place — multiple tests in this file can re-use it.
    },
  };
}

describe("Custom adapter via extends (US3 SC-004)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProjectWithKvAdapter();
  });

  afterEach(() => project.cleanup());

  it(
    "compose succeeds against a hand-authored adapter loaded via extends",
    { timeout: 60_000 },
    async () => {
      const { compose } = await import("@composer/core");

      const result = await compose(
        project.projectRoot,
        "app-config",
        {
          primitive: "Config",
          id: "app-config",
          name: "app",
          values: [
            { key: "PORT", value: "3000" },
            { key: "HOST", value: "0.0.0.0" },
          ],
        },
        { surface: "cli" },
      );

      expect(result.audit.ok).toBe(true);
      expect(result.files_written).toHaveLength(1);
      const out = result.files_written[0]!;
      expect(out.path).toBe("config/app.env");
      expect(out.kind).toBe("created");

      const generated = readFileSync(join(project.projectRoot, out.path), "utf8");
      expect(generated).toContain("PORT=3000");
      expect(generated).toContain("HOST=0.0.0.0");
    },
  );

  it(
    "parent audit blocks compose when its rule fails (US3 Acceptance #3)",
    { timeout: 60_000 },
    async () => {
      const { compose } = await import("@composer/core");

      // Compose two configs sharing the same `name` — the parent audit ships
      // a "unique Config name" rule that should reject the second.
      await compose(
        project.projectRoot,
        "first",
        {
          primitive: "Config",
          id: "first",
          name: "shared-name",
          values: [{ key: "A", value: "1" }],
        },
        { surface: "cli" },
      );

      await expect(
        compose(
          project.projectRoot,
          "second",
          {
            primitive: "Config",
            id: "second",
            name: "shared-name",
            values: [{ key: "B", value: "2" }],
          },
          { surface: "cli" },
        ),
      ).rejects.toThrow(/duplicate Config name|AUDIT_FAILED/);

      // Rollback proof: second spec must not have been persisted.
      expect(
        existsSync(join(project.projectRoot, "design/specs/second.json")),
      ).toBe(false);
    },
  );
});
