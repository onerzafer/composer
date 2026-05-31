// T018 / 004 US2 — the quality gate is a BLOCKING precondition on `promote`
// (FR-007 / SC-002). A draft that fails a blocking check is refused; `--force`
// promotes it anyway and records the overridden findings. Because `promote` is
// the gate SHARED with 003, this protects ingested drafts too.

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

function makeProject(): { projectRoot: string; workspaceRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-grammar-precond-"));
  const workspaceRoot = join(projectRoot, "design");
  mkdirSync(join(workspaceRoot, "catalog", "ingested"), { recursive: true });
  mkdirSync(join(workspaceRoot, "catalog", "primitives"), { recursive: true });
  mkdirSync(join(workspaceRoot, "templates"), { recursive: true });
  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify({ workspace: "./design", engine: "@composer/typescript@1" }, null, 2),
    "utf8",
  );
  return {
    projectRoot,
    workspaceRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

/** Stage a draft with INCOMPLETE metadata (fails the blocking metadata check). */
function stageFailingDraft(stagingDir: string): void {
  writeFileSync(
    join(stagingDir, "Risky.draft.ts"),
    `import { z } from "zod";
export const Risky = z.object({ primitive: z.literal("Risky"), id: z.string(), title: z.string() }).strict();
export const RiskyMeta = {
  primitive: "Risky", version: "0.1.0", intent: "TODO: describe Risky.",
  whenToUse: "TODO", whenNotToUse: ["TODO"], fieldGuidance: {}, examples: [],
};
`,
    "utf8",
  );
  writeFileSync(join(stagingDir, "Risky.draft.ts.hbs"), `// {{id}}\nexport const x_{{id}} = {{{json title}}};\n`, "utf8");
}

describe("promote quality precondition (004 US2 / FR-007 / SC-002)", () => {
  let proj: ReturnType<typeof makeProject>;
  beforeEach(() => {
    proj = makeProject();
  });
  afterEach(() => proj.cleanup());

  it("refuses a draft that fails a blocking quality check", async () => {
    const { promote } = await import("@composer/cli");
    stageFailingDraft(join(proj.workspaceRoot, "catalog", "ingested"));

    await expect(
      promote({ projectRoot: proj.projectRoot, draftName: "Risky" }),
    ).rejects.toThrow(/quality gate|metadata/i);

    // Nothing moved — the draft is still staged, the catalog untouched.
    expect(existsSync(join(proj.workspaceRoot, "catalog", "ingested", "Risky.draft.ts"))).toBe(true);
    expect(existsSync(join(proj.workspaceRoot, "catalog", "primitives", "risky.ts"))).toBe(false);
  });

  it("--force overrides the gate and records the overridden findings", async () => {
    const { promote } = await import("@composer/cli");
    stageFailingDraft(join(proj.workspaceRoot, "catalog", "ingested"));

    const result = await promote({ projectRoot: proj.projectRoot, draftName: "Risky", force: true });
    expect(result.ok).toBe(true);
    expect(result.qualityOverride).toContain("metadata");
    // The move happened despite the failing gate.
    expect(existsSync(join(proj.workspaceRoot, "catalog", "primitives", "risky.ts"))).toBe(true);
    expect(existsSync(join(proj.workspaceRoot, "templates", "risky.ts.hbs"))).toBe(true);
  });
});
