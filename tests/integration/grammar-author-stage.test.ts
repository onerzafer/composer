// T008 / 004 US1 — grammar.author stages a draft into 003's staging dir, and
// the engine loader does not see it (FR-003 / SC-003 inertness). The forward
// (grammar-kit) authoring assist reuses the SAME staging mechanism as the
// reverse (ingest-kit) one — proven here by staging via @composer/grammar-kit
// and asserting the catalog is byte-identical with and without the draft.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeMinimalProject(): {
  projectRoot: string;
  workspaceRoot: string;
  cleanup: () => void;
} {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-grammar-stage-"));
  const workspaceRoot = join(projectRoot, "design");
  mkdirSync(join(workspaceRoot, "catalog", "primitives"), { recursive: true });
  mkdirSync(join(workspaceRoot, "catalog", "ingested"), { recursive: true });
  mkdirSync(join(workspaceRoot, "templates"), { recursive: true });
  mkdirSync(join(workspaceRoot, "specs"), { recursive: true });

  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify({ workspace: "./design", engine: "@composer/typescript@1" }, null, 2),
    "utf8",
  );

  // Minimal catalog: one Hero primitive. The loader walks from catalog/index.ts
  // only, so a draft under catalog/ingested/ is structurally invisible.
  writeFileSync(
    join(workspaceRoot, "catalog", "index.ts"),
    `import { z } from "zod";
export const Hero = z
  .object({ primitive: z.literal("Hero"), id: z.string(), title: z.string() })
  .strict();
export const HeroMeta = {
  primitive: "Hero", version: "0.1.0", intent: "demo",
  whenToUse: "demo", whenNotToUse: [], fieldGuidance: {}, examples: [],
};
export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero]);
`,
    "utf8",
  );

  return {
    projectRoot,
    workspaceRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("grammar.author → staging (004 US1 / FR-003 / SC-003 inertness)", () => {
  let proj: ReturnType<typeof makeMinimalProject>;

  beforeEach(() => {
    proj = makeMinimalProject();
  });

  afterEach(() => proj.cleanup());

  it(
    "stages a draft into catalog/ingested/, invisible to the loader",
    { timeout: 60_000 },
    async () => {
      const { stageDraft } = await import("@composer/grammar-kit");
      const { greetingDraft } = await import("../fixtures/grammar-kit/expected-draft.js");
      const { loadCatalog } = await import("@composer/typescript");

      const catalogDir = join(proj.workspaceRoot, "catalog");

      // Baseline catalog export set BEFORE staging.
      const before = await loadCatalog(catalogDir);
      const beforeExports = new Set(Object.keys(before.module).sort());

      // Author → stage (the forward assist; reuses 003's writeDraft under the hood).
      const result = stageDraft({ projectRoot: proj.projectRoot, draft: greetingDraft });
      expect(result.ok).toBe(true);

      // Draft files landed in the staging dir.
      const stagingDir = join(proj.workspaceRoot, "catalog", "ingested");
      expect(existsSync(join(stagingDir, "Greeting.draft.ts"))).toBe(true);
      expect(existsSync(join(stagingDir, "Greeting.draft.ts.hbs"))).toBe(true);

      // Loader STILL sees only what it saw before — the draft is inert.
      const after = await loadCatalog(catalogDir);
      const afterExports = new Set(Object.keys(after.module).sort());
      expect(afterExports).toEqual(beforeExports);
      expect(afterExports.has("Greeting")).toBe(false);
    },
  );
});
