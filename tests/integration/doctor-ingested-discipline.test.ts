// T017 / 003 Polish — `composer doctor` flags an oversized *ingested* draft
// template (FR-010), so a complex derived component surfaces as "needs
// decomposition" BEFORE it can be promoted, rather than being accepted silently.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeWorkspace(): { projectRoot: string; workspaceRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-doctor-ingest-"));
  const workspaceRoot = join(projectRoot, "design");
  mkdirSync(join(workspaceRoot, "catalog", "ingested"), { recursive: true });
  mkdirSync(join(workspaceRoot, "templates"), { recursive: true });
  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify({ workspace: "./design", engine: "@composer/typescript@1" }, null, 2),
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

describe("doctor — 30-line discipline covers ingested drafts (003 T017 / FR-010)", () => {
  let ws: ReturnType<typeof makeWorkspace>;

  beforeEach(() => {
    ws = makeWorkspace();
  });

  afterEach(() => ws.cleanup());

  it("flags an oversized ingested draft template as a warning", async () => {
    const { doctor } = await import("@composer/cli");

    // A 40-line draft template in quarantine — well over the 30-line discipline.
    const big = Array.from({ length: 40 }, (_, i) => `<Line${i} />`).join("\n");
    writeFileSync(
      join(ws.workspaceRoot, "catalog", "ingested", "Huge.draft.tsx.hbs"),
      big,
      "utf8",
    );

    const report = doctor({ projectRoot: ws.projectRoot });
    const disciplineIssues = report.issues.filter(
      (i) => i.report === "discipline-30-line",
    );
    const flagged = disciplineIssues.find(
      (i) => i.severity === "warn" && i.message.includes("Huge.draft.tsx.hbs"),
    );
    expect(flagged).toBeDefined();
    expect(flagged!.message).toMatch(/ingested draft/);
  });

  it("does not flag a small ingested draft", async () => {
    const { doctor } = await import("@composer/cli");
    writeFileSync(
      join(ws.workspaceRoot, "catalog", "ingested", "Small.draft.tsx.hbs"),
      `<Small {{{json title}}} />\n`,
      "utf8",
    );

    const report = doctor({ projectRoot: ws.projectRoot });
    const warns = report.issues.filter(
      (i) => i.report === "discipline-30-line" && i.severity === "warn",
    );
    expect(warns).toHaveLength(0);
  });
});
