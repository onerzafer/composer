// T005 / 003 US1 — ingest writes drafts ONLY to catalog/ingested/, and
// the engine loader does not see them (FR-023 / SC-002 inertness).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSER_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const FIXTURE_CARD = join(
  COMPOSER_ROOT,
  "tests",
  "fixtures",
  "ingest-react",
  "Card.tsx",
);

function makeMinimalWorkspace(): {
  workspaceRoot: string;
  quarantineDir: string;
  cleanup: () => void;
} {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-ingest-"));
  const workspaceRoot = join(projectRoot, "design");
  mkdirSync(join(workspaceRoot, "catalog", "primitives"), { recursive: true });
  mkdirSync(join(workspaceRoot, "catalog", "ingested"), { recursive: true });
  mkdirSync(join(workspaceRoot, "templates"), { recursive: true });
  mkdirSync(join(workspaceRoot, "specs"), { recursive: true });

  // Minimal catalog: one Hero primitive — the loader walks from catalog/index.ts
  // only, so drafts under catalog/ingested/ are structurally invisible.
  writeFileSync(
    join(workspaceRoot, "catalog", "index.ts"),
    `import { z } from "zod";
export const Hero = z
  .object({ primitive: z.literal("Hero"), id: z.string(), title: z.string() })
  .strict();
export const HeroMeta = {
  primitive: "Hero",
  version: "0.1.0",
  intent: "demo",
  whenToUse: "demo",
  whenNotToUse: [],
  fieldGuidance: {},
  examples: [],
};
export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero]);
`,
    "utf8",
  );

  return {
    workspaceRoot,
    quarantineDir: join(workspaceRoot, "catalog", "ingested"),
    cleanup: () => rmSync(dirname(workspaceRoot), { recursive: true, force: true }),
  };
}

describe("ingest → quarantine (003 US1 / SC-002 inertness)", () => {
  let ws: ReturnType<typeof makeMinimalWorkspace>;

  beforeEach(() => {
    ws = makeMinimalWorkspace();
  });

  afterEach(() => ws.cleanup());

  it(
    "writes drafts only to catalog/ingested/, and the loader does not see them",
    { timeout: 60_000 },
    async () => {
      const { reactIngester } = await import("@composer/ingest-react");
      const { writeDraft } = await import("@composer/ingest-kit");
      const { loadCatalog } = await import("@composer/typescript");

      // Catalog BEFORE ingest — establishes the baseline export set.
      const before = await loadCatalog(join(ws.workspaceRoot, "catalog"));
      const beforeExports = new Set(Object.keys(before.module).sort());

      // Ingest.
      const drafts = await reactIngester.ingest(FIXTURE_CARD, {
        projectRoot: dirname(ws.workspaceRoot),
        quarantineDir: ws.quarantineDir,
      });
      expect(drafts.length).toBeGreaterThan(0);
      for (const draft of drafts) {
        writeDraft(draft, ws.quarantineDir);
      }

      // Drafts on disk in the quarantine — and the right files.
      expect(existsSync(join(ws.quarantineDir, "Card.draft.ts"))).toBe(true);
      expect(existsSync(join(ws.quarantineDir, "Card.draft.tsx.hbs"))).toBe(true);

      // Loader STILL sees only what it saw before — drafts are invisible.
      const after = await loadCatalog(join(ws.workspaceRoot, "catalog"));
      const afterExports = new Set(Object.keys(after.module).sort());
      expect(afterExports).toEqual(beforeExports);
    },
  );
});
