// T073 — extends resolution rules (US3 Acceptance #1).
//
// When a project supplies a template with the same filename as the parent
// adapter, the project's wins. The `templateOrigin` map exposed on
// `EffectiveWorkspace` lets `composer doctor` distinguish project vs parent
// contributions later (T094).

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

/**
 * Project workspace with a local template that has the same filename as the
 * parent's (`config.env.hbs`) but emits in a distinguishable format so we can
 * assert which template won.
 */
const PROJECT_TEMPLATE = `# PROJECT WON — from: spec={{spec_path}} primitive=Config id={{id}}
{{#each values}}{{key}}: {{value}}
{{/each}}
`;

function makeProject(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-extends-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: "x", version: "0.0.0", private: true, type: "module" }),
    "utf8",
  );
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");

  const kvInstalled = join(TESTS_NODE_MODULES, "@composer-test", "adapter-keyvalue");
  if (!existsSync(kvInstalled)) {
    mkdirSync(dirname(kvInstalled), { recursive: true });
    cpSync(KV_ADAPTER_DIR, kvInstalled, { recursive: true, dereference: true });
  }

  mkdirSync(join(projectRoot, "design", "specs"), { recursive: true });
  mkdirSync(join(projectRoot, "design", "templates"), { recursive: true });
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

  // Project-local template that shadows parent's `config.env.hbs`.
  writeFileSync(
    join(projectRoot, "design", "templates", "config.env.hbs"),
    PROJECT_TEMPLATE,
    "utf8",
  );

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("extends template layering (US3 Acceptance #1)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProject();
  });

  afterEach(() => project.cleanup());

  it(
    "project's template wins when both project and parent define the same filename",
    { timeout: 60_000 },
    async () => {
      const { compose } = await import("@composer/core");
      const result = await compose(
        project.projectRoot,
        "ov",
        {
          primitive: "Config",
          id: "ov",
          name: "overridden",
          values: [{ key: "K1", value: "v1" }],
        },
        { surface: "cli" },
      );
      expect(result.files_written).toHaveLength(1);
      const generated = readFileSync(
        join(project.projectRoot, result.files_written[0]!.path),
        "utf8",
      );
      // Parent template emits `KEY=value`. Project template emits `KEY: value`
      // with a "PROJECT WON" banner. Distinguishing is the whole point.
      expect(generated).toContain("PROJECT WON");
      expect(generated).toContain("K1: v1");
      expect(generated).not.toMatch(/^K1=v1$/m);
    },
  );

  it(
    "templateOrigin map tracks which workspace contributed each template",
    async () => {
      const { layerWorkspace, resolveAndCacheParent } = await import("@composer/core");
      const parent = resolveAndCacheParent(
        project.projectRoot,
        "@composer-test/adapter-keyvalue@0",
      );
      const ws = layerWorkspace(join(project.projectRoot, "design"), parent);
      expect(ws.templateOrigin.get("config.env.hbs")).toBe("project");
      // No other templates exist — both parent and project only ship config.env.hbs.
      expect(ws.templatePaths.size).toBe(1);
    },
  );
});
