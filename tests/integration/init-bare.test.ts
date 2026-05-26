// T068 — `composer init --bare` (US2 Acceptance #3).
//
// Bare init creates a minimal self-contained workspace (one example primitive +
// template + output.map) without pulling any adapter. The sample compose must
// still succeed so the loop is provably working.

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
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-init-bare-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      { name: "init-bare-fixture", version: "0.0.0", private: true, type: "module" },
      null,
      2,
    ),
    "utf8",
  );
  // Symlink tests/node_modules so the bare workspace's catalog can resolve zod.
  try {
    symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");
  } catch {
    /* best-effort */
  }
  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

const TEST_TIMEOUT_MS = 90_000;

describe("composer init --bare (US2 Acceptance #3)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeEmptyProject();
  });

  afterEach(() => project.cleanup());

  it(
    "creates a minimal self-contained workspace with one primitive + template + output.map",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const { init } = await import("@composer/cli");

      const result = await init({ projectRoot: project.projectRoot, bare: true });
      expect(result.ok).toBe(true);

      // composer.json present, no extends
      const cfg = JSON.parse(
        readFileSync(join(project.projectRoot, "composer.json"), "utf8"),
      ) as { workspace: string; engine: string; extends?: string };
      expect(cfg.workspace).toBe("./design");
      expect(cfg.engine).toBe("@composer/typescript@1");
      expect(cfg.extends).toBeUndefined();

      // Workspace contains catalog/index.ts + one template + output.map.ts
      const workspaceRoot = join(project.projectRoot, "design");
      expect(existsSync(join(workspaceRoot, "catalog", "index.ts"))).toBe(true);
      expect(existsSync(join(workspaceRoot, "output.map.ts"))).toBe(true);
      // At least one template file under templates/
      const templateExists =
        existsSync(join(workspaceRoot, "templates", "hero.ts.hbs")) ||
        existsSync(join(workspaceRoot, "templates", "hero.tsx.hbs"));
      expect(templateExists).toBe(true);

      // .gitignore entries
      const gitignore = readFileSync(join(project.projectRoot, ".gitignore"), "utf8");
      expect(gitignore).toContain(".composer/cache/");

      // Sample compose ran — starter spec written + output emitted
      expect(result.sampleSpec).not.toBeNull();
      expect(result.sampleOutput).not.toBeNull();
      expect(existsSync(join(project.projectRoot, result.sampleSpec!))).toBe(true);
      expect(existsSync(join(project.projectRoot, result.sampleOutput!))).toBe(true);
    },
  );
});
