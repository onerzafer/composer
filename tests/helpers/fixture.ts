// Shared test-fixture helper — creates a minimal Composer project in a tempdir.
//
// The full reference fixture lives in T065 (tests/fixtures/next-project/);
// these helpers are for unit/integration tests that need a one-off project.

import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// Resolve the composer monorepo root: tests/helpers/fixture.ts → tests/helpers → tests → ROOT
const COMPOSER_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");
const ADAPTER_NEXT_DIR = join(COMPOSER_ROOT, "packages", "adapter-next");

export interface Fixture {
  projectRoot: string;
  workspaceRoot: string;
  cleanup: () => void;
}

export interface FixtureOptions {
  /** Customize composer.json content (defaults to bare workspace=./design, engine=@composer/typescript@1). */
  composerJson?: Record<string, unknown>;
  /** Files to seed into the workspace, keyed by path relative to workspace root. */
  files?: Record<string, string>;
}

/** Create a temporary minimal Composer project. */
export function makeFixture(options: FixtureOptions = {}): Fixture {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-fixture-"));
  const workspaceRoot = join(projectRoot, "design");

  const composerJson = options.composerJson ?? {
    workspace: "./design",
    engine: "@composer/typescript@1",
  };
  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify(composerJson, null, 2),
    "utf8",
  );

  // Fixture projects need `"type": "module"` so tsx transpiles workspace
  // TS files (catalog/index.ts, output.map.ts) as ESM rather than CJS.
  // Without this, dynamically-loaded TS modules emit `__filename` references
  // that fail in the ESM-mode test runner.
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: "composer-fixture", version: "0.0.0", private: true, type: "module" }, null, 2),
    "utf8",
  );

  // Symlink the tests workspace's node_modules so the fixture's catalog can
  // resolve `zod` etc. Pnpm uses content-addressing in the root node_modules,
  // so we point at tests/node_modules where zod is a direct dep.
  if (existsSync(TESTS_NODE_MODULES)) {
    try {
      symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");
    } catch {
      /* best-effort; surface failures via test errors */
    }
  }

  mkdirSync(join(workspaceRoot, "catalog"), { recursive: true });
  mkdirSync(join(workspaceRoot, "templates"), { recursive: true });
  mkdirSync(join(workspaceRoot, "specs"), { recursive: true });

  for (const [relPath, content] of Object.entries(options.files ?? {})) {
    const abs = join(workspaceRoot, relPath);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }

  return {
    projectRoot,
    workspaceRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

/** Minimal Hero-only catalog content used by several tests. */
export const STUB_CATALOG_INDEX = `import { z } from "zod";

export const Hero = z.object({
  primitive: z.literal("Hero"),
  id: z.string(),
  title: z.string().min(1),
}).strict();

export const HeroMeta = {
  primitive: "Hero",
  version: "1.0.0",
  intent: "Top-of-page focal block.",
  whenToUse: "Page hero anchoring the section.",
  whenNotToUse: ["Use OverlayHero for image-led pages"],
  fieldGuidance: { title: "1-line action-oriented" },
  examples: [{ primitive: "Hero", id: "demo", title: "Hello world" }],
} as const;

export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero]);
`;

export const STUB_HERO_TEMPLATE = `// from: spec={{spec_path}} primitive=Hero id={{id}}
export const hero_{{id}} = { title: {{{json title}}} };
`;

export const STUB_OUTPUT_MAP = `export default {
  byPrimitive: {
    Hero: (node) => [{ path: "src/heroes/" + node.id + ".ts", language: "ts" }],
  },
};
`;

/**
 * T065 — Next.js fixture project.
 *
 * Creates a Composer-instrumented Next.js project in a tempdir by copying
 * `@composer/adapter-next`'s catalog + templates + output.map into the
 * fixture's workspace. The fixture is throw-away per test.
 *
 * Why programmatic instead of a checked-in fixture: avoids duplicating the
 * adapter content across the repo. CI exercises adapter-next via this helper
 * so any adapter change is automatically reflected in E2E tests.
 */
export function makeNextProjectFixture(options: FixtureOptions = {}): Fixture {
  const fixture = makeFixture(options);

  // Copy adapter-next's content into the workspace as if `composer init
  // --extends @composer/adapter-next` had populated it.
  cpSync(join(ADAPTER_NEXT_DIR, "catalog"), join(fixture.workspaceRoot, "catalog"), {
    recursive: true,
  });
  cpSync(join(ADAPTER_NEXT_DIR, "templates"), join(fixture.workspaceRoot, "templates"), {
    recursive: true,
  });
  cpSync(join(ADAPTER_NEXT_DIR, "output.map.ts"), join(fixture.workspaceRoot, "output.map.ts"));

  return fixture;
}
