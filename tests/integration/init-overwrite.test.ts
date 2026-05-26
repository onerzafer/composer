// T069 — `composer init` refuses to overwrite existing composer.json
// (US2 Acceptance #2, exit code 1 per contracts/cli-commands.md).
//
// Re-running init in a project that already has composer.json MUST exit 1 with
// a clear error and leave existing files untouched.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface CaughtInitError extends Error {
  exitCode: number;
}

function makeProjectWithComposerJson(): {
  projectRoot: string;
  existingConfig: string;
  cleanup: () => void;
} {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-init-overwrite-"));
  const existingConfig = JSON.stringify(
    { workspace: "./pre-existing", engine: "@composer/typescript@1" },
    null,
    2,
  );
  writeFileSync(join(projectRoot, "composer.json"), existingConfig, "utf8");
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: "overwrite-fixture", version: "0.0.0", private: true }, null, 2),
    "utf8",
  );
  return {
    projectRoot,
    existingConfig,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("composer init refuses overwrite (US2 Acceptance #2)", () => {
  let project: { projectRoot: string; existingConfig: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProjectWithComposerJson();
  });

  afterEach(() => project.cleanup());

  it("throws/exits with code 1 when composer.json already exists; does not modify the file", async () => {
    const { init } = await import("@composer/cli");

    let caught: CaughtInitError | null = null;
    try {
      await init({ projectRoot: project.projectRoot, bare: true });
    } catch (err) {
      caught = err as CaughtInitError;
    }

    // init() throws an InitError (exitCode=1) — easier to consume in tests than
    // exit-on-failure. The bin wrapper translates this into process.exit(1).
    expect(caught).not.toBeNull();
    expect(caught!.exitCode).toBe(1);
    expect(caught!.message.toLowerCase()).toContain("composer.json");

    // Existing config untouched
    const after = readFileSync(join(project.projectRoot, "composer.json"), "utf8");
    expect(after).toEqual(project.existingConfig);

    // No workspace folder was created
    expect(existsSync(join(project.projectRoot, "design"))).toBe(false);
  });
});
