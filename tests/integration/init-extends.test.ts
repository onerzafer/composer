// T067 — `composer init --extends <pkg>` (US2 Acceptance #1, SC-002).
//
// From an empty project dir (with just a package.json so `npm install` works),
// `composer init --extends @composer/adapter-next` must produce a working
// Composer-instrumented Next.js project — composer.json + workspace + .gitignore
// entries + a successful sample compose — all within 30 seconds (SC-002).
//
// Approach: import init() directly (rather than spawning the CLI binary) so the
// test does not pay an extra Node startup. The CLI's commander wrapper is a thin
// delegator; T070's bin test would shell out, but the behavior we care about
// lives in the command function.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
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
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");

function makeEmptyProject(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-init-extends-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      { name: "init-extends-fixture", version: "0.0.0", private: true, type: "module" },
      null,
      2,
    ),
    "utf8",
  );
  // Symlink tests/node_modules so the resolver finds @composer/adapter-next
  // without shelling out to npm. Mirrors the strategy used by makeFixture().
  try {
    symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");
  } catch {
    /* leave empty — init must then fall through to `npm install`, which the
     * test will fail-fast on; useful signal that the symlink strategy broke. */
  }
  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

const SC_002_BUDGET_MS = 30_000;
// Test-suite-only budget: tsx cold-start adds ~30s on top of init's own work
// (mirrors agent-loop.test.ts E2E_TIMEOUT_MS). SC-002's 30s budget is asserted
// separately against the engine's own measured elapsedMs.
const TEST_TIMEOUT_MS = 90_000;

describe("composer init --extends (US2 Acceptance #1, SC-002)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeEmptyProject();
  });

  afterEach(() => project.cleanup());

  it(
    "writes composer.json + workspace + .gitignore and runs a sample compose in ≤30s",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const { init } = await import("@composer/cli");

      const result = await init({
        projectRoot: project.projectRoot,
        extends: "@composer/adapter-next",
      });

      expect(result.ok).toBe(true);
      expect(result.elapsedMs).toBeLessThanOrEqual(SC_002_BUDGET_MS);

      // composer.json present with extends + engine pinned
      const composerJsonPath = join(project.projectRoot, "composer.json");
      expect(existsSync(composerJsonPath)).toBe(true);
      const cfg = JSON.parse(readFileSync(composerJsonPath, "utf8")) as {
        workspace: string;
        engine: string;
        extends: string;
      };
      expect(cfg.workspace).toBe("./design");
      expect(cfg.engine).toBe("@composer/typescript@1");
      // The extends field is pinned to the installed semver-major per the
      // composer-json schema (pattern `<pkg>@<major>`). adapter-next is on 0.x.
      expect(cfg.extends).toMatch(/^@composer\/adapter-next@\d+$/);

      // Workspace skeleton present (catalog/ + templates/ + specs/ + output.map.ts)
      const workspaceRoot = join(project.projectRoot, "design");
      expect(existsSync(join(workspaceRoot, "catalog"))).toBe(true);
      expect(existsSync(join(workspaceRoot, "templates"))).toBe(true);
      expect(existsSync(join(workspaceRoot, "specs"))).toBe(true);
      expect(existsSync(join(workspaceRoot, "output.map.ts"))).toBe(true);

      // .gitignore appended with .composer entries
      const gitignore = readFileSync(join(project.projectRoot, ".gitignore"), "utf8");
      expect(gitignore).toContain(".composer/cache/");
      expect(gitignore).toContain(".composer/logs/");
      expect(gitignore).toContain(".composer/staging/");

      // Sample compose ran — starter spec written + real source emitted
      expect(result.sampleSpec).toBe("design/specs/home.json");
      expect(existsSync(join(project.projectRoot, "design/specs/home.json"))).toBe(true);
      expect(result.sampleOutput).toBe("src/app/home/page.tsx");
      const generated = readFileSync(
        join(project.projectRoot, "src/app/home/page.tsx"),
        "utf8",
      );
      expect(generated).toMatch(/DO NOT EDIT.*Composer/s);
      expect(generated).toContain("Welcome to Composer");
    },
  );

  it(
    "is idempotent in spirit: re-running with a fresh project gives the same composer.json shape",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const { init } = await import("@composer/cli");

      const r1 = await init({
        projectRoot: project.projectRoot,
        extends: "@composer/adapter-next",
      });

      const second = makeEmptyProject();
      try {
        const r2 = await init({
          projectRoot: second.projectRoot,
          extends: "@composer/adapter-next",
        });
        const c1 = readFileSync(join(r1.projectRoot, "composer.json"), "utf8");
        const c2 = readFileSync(join(r2.projectRoot, "composer.json"), "utf8");
        expect(c2).toEqual(c1);
      } finally {
        second.cleanup();
      }
    },
  );
});
