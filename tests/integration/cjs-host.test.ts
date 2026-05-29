// 002-fix-commonjs-host — regression test for compose inside a CommonJS host.
//
// Reproduces the bug: when the host project's package.json has no
// "type":"module" (the default for NestJS/Express/most Node backends) and the
// workspace has no design/package.json, tsx transpiles output.map.ts to
// CommonJS and Node's interop double-wraps the default export. Pre-fix,
// `loadOutputMap` returned `{ default: { byPrimitive } }`, so `byPrimitive` was
// undefined and compose threw `Cannot read properties of undefined (reading 'Note')`.
//
// This test composes a one-primitive workspace in a CJS host and asserts the
// output file is written (SC-001).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSER_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const FIXTURE = join(COMPOSER_ROOT, "tests", "fixtures", "cjs-host");
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");

function makeCjsHostProject(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-cjs-"));
  // Copy the fixture (host package.json WITHOUT type:module + workspace) into a
  // temp project so compose output + .composer cache don't touch the repo.
  cpSync(FIXTURE, projectRoot, { recursive: true, dereference: true });
  // Symlink tests/node_modules so the workspace catalog can resolve zod.
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");
  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("compose in a CommonJS host project (002 SC-001)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeCjsHostProject();
  });

  afterEach(() => project.cleanup());

  it(
    "composes successfully when the host package.json has no type:module",
    { timeout: 60_000 },
    async () => {
      // Guard the preconditions that make this a *CommonJS* host — if either of
      // these drifts, the test would silently stop exercising the bug.
      const hostPkg = JSON.parse(
        readFileSync(join(project.projectRoot, "package.json"), "utf8"),
      ) as { type?: string };
      expect(hostPkg.type).toBeUndefined();
      expect(existsSync(join(project.projectRoot, "design", "package.json"))).toBe(false);

      const { compose } = await import("@composer/core");

      const result = await compose(
        project.projectRoot,
        "hello",
        { primitive: "Note", id: "hello", text: "hello from cjs host" },
        { surface: "cli" },
      );

      expect(result.files_written).toHaveLength(1);
      const out = result.files_written[0]!;
      expect(out.path).toBe("src/notes/hello.ts");

      const generated = readFileSync(join(project.projectRoot, out.path), "utf8");
      expect(generated).toContain("hello from cjs host");
    },
  );
});
