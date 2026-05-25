// Shared test-fixture helper — creates a minimal Composer project in a tempdir.
//
// The full reference fixture lives in T065 (tests/fixtures/next-project/);
// these helpers are for unit/integration tests that need a one-off project.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
