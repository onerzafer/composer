// T006 / 003 US1 — `composer promote` moves a draft from catalog/ingested/
// into the live catalog, and refuses a collision with an existing primitive
// (FR-002 + FR-007).

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

function makeStaged(): {
  projectRoot: string;
  workspaceRoot: string;
  cleanup: () => void;
} {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-promote-"));
  const workspaceRoot = join(projectRoot, "design");
  mkdirSync(join(workspaceRoot, "catalog", "primitives"), { recursive: true });
  mkdirSync(join(workspaceRoot, "catalog", "ingested"), { recursive: true });
  mkdirSync(join(workspaceRoot, "templates"), { recursive: true });
  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify(
      { workspace: "./design", engine: "@composer/typescript@1" },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    join(workspaceRoot, "catalog", "index.ts"),
    `import { z } from "zod";\nexport const PrimitiveNode = z.discriminatedUnion("primitive", []);\n`,
    "utf8",
  );
  return {
    projectRoot,
    workspaceRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("composer promote (003 US1 / FR-002 + FR-007)", () => {
  let ws: ReturnType<typeof makeStaged>;

  beforeEach(() => {
    ws = makeStaged();
  });

  afterEach(() => ws.cleanup());

  it(
    "moves a draft from catalog/ingested/ into the live catalog + templates/",
    { timeout: 60_000 },
    async () => {
      // Stage a draft as if ingest had just run.
      const schemaDraft = join(
        ws.workspaceRoot,
        "catalog",
        "ingested",
        "Card.draft.ts",
      );
      const templateDraft = join(
        ws.workspaceRoot,
        "catalog",
        "ingested",
        "Card.draft.tsx.hbs",
      );
      writeFileSync(schemaDraft, `export const Card = "schema";\n`, "utf8");
      writeFileSync(templateDraft, `<Card />\n`, "utf8");

      const { promote } = await import("@composer/cli");
      const result = await promote({
        projectRoot: ws.projectRoot,
        draftName: "Card",
      });
      expect(result.ok).toBe(true);

      // Drafts gone; live files present (lowercase basenames per engine convention).
      expect(existsSync(schemaDraft)).toBe(false);
      expect(existsSync(templateDraft)).toBe(false);
      expect(
        existsSync(join(ws.workspaceRoot, "catalog", "primitives", "card.ts")),
      ).toBe(true);
      expect(
        existsSync(join(ws.workspaceRoot, "templates", "card.tsx.hbs")),
      ).toBe(true);
    },
  );

  it(
    "refuses to overwrite an existing live primitive (collision)",
    { timeout: 60_000 },
    async () => {
      // Pre-existing live primitive of the same name.
      writeFileSync(
        join(ws.workspaceRoot, "catalog", "primitives", "card.ts"),
        `export const Card = "live";\n`,
        "utf8",
      );
      // Stage a draft with the same name.
      writeFileSync(
        join(ws.workspaceRoot, "catalog", "ingested", "Card.draft.ts"),
        `export const Card = "draft";\n`,
        "utf8",
      );
      writeFileSync(
        join(ws.workspaceRoot, "catalog", "ingested", "Card.draft.tsx.hbs"),
        `<Card />\n`,
        "utf8",
      );

      const { promote } = await import("@composer/cli");
      await expect(
        promote({ projectRoot: ws.projectRoot, draftName: "Card" }),
      ).rejects.toThrow(/already exists|collision/i);
    },
  );
});
