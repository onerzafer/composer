// T016 / 004 US2 — `composer grammar check` quality report (FR-006/FR-007/FR-008).
// Flags: an oversized (>30-line) template, missing whenNotToUse/example,
// incoherent schema↔template, and a control-flow primitive. A conforming draft
// passes. The BLOCKING checks (30-line / total-functional / metadata) drive
// `report.ok`; coherence is an advisory warning.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CandidateDraft } from "@composer/ingest-kit";

function makeProject(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-grammar-quality-"));
  mkdirSync(join(projectRoot, "design", "catalog", "ingested"), { recursive: true });
  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify({ workspace: "./design", engine: "@composer/typescript@1" }, null, 2),
    "utf8",
  );
  return { projectRoot, cleanup: () => rmSync(projectRoot, { recursive: true, force: true }) };
}

/** Build a draft with complete metadata, overridable per-case. */
function draft(over: Partial<CandidateDraft> & { name: string }): CandidateDraft {
  const name = over.name;
  const fields = over.schemaSource ? "" : "    title: z.string().min(1),\n";
  const schemaSource =
    over.schemaSource ??
    `import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";
export const ${name} = z
  .object({
    primitive: z.literal("${name}"),
    id: z.string(),
${fields}  })
  .strict();
export const ${name}Meta: PrimitiveMeta = {
  primitive: "${name}", version: "0.1.0",
  intent: "A real, non-placeholder intent for ${name}.",
  whenToUse: "When the ${name} shape applies.",
  whenNotToUse: ["When a different primitive fits better."],
  fieldGuidance: { title: "the heading text" },
  examples: [{ primitive: "${name}", id: "demo", title: "Hi" }],
};
`;
  return {
    name,
    source: "test",
    schemaSource,
    templateSource: over.templateSource ?? `// {{id}}\nexport const x_{{id}} = {{{json title}}};\n`,
    templateLanguage: over.templateLanguage ?? "ts",
    meta: over.meta ?? {},
  };
}

describe("composer grammar check — quality report (004 US2 / FR-007)", () => {
  let proj: ReturnType<typeof makeProject>;
  beforeEach(() => {
    proj = makeProject();
  });
  afterEach(() => proj.cleanup());

  async function check(d: CandidateDraft) {
    const { stageDraft } = await import("@composer/grammar-kit");
    const { grammarCheck } = await import("@composer/cli");
    stageDraft({ projectRoot: proj.projectRoot, draft: d });
    return grammarCheck({ projectRoot: proj.projectRoot, draftName: d.name });
  }

  function find(report: { checks: { id: string; pass: boolean; severity: string }[] }, id: string) {
    return report.checks.find((c) => c.id === id)!;
  }

  it("passes a conforming draft", async () => {
    const report = await check(draft({ name: "Heading" }));
    expect(report.ok).toBe(true);
    expect(report.failing).toEqual([]);
  });

  it("flags an oversized (>30-line) template (BLOCKING)", async () => {
    const big = Array.from({ length: 40 }, (_, i) => `line ${i} {{id}}`).join("\n");
    const report = await check(draft({ name: "Bloated", templateSource: big }));
    expect(find(report, "30-line").pass).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.failing).toContain("30-line");
  });

  it("flags missing whenNotToUse / example (BLOCKING)", async () => {
    const schemaSource = `import { z } from "zod";
export const Bare = z.object({ primitive: z.literal("Bare"), id: z.string(), title: z.string() }).strict();
export const BareMeta = {
  primitive: "Bare", version: "0.1.0", intent: "real intent",
  whenToUse: "x", whenNotToUse: ["TODO"], fieldGuidance: {}, examples: [],
};
`;
    const report = await check(draft({ name: "Bare", schemaSource }));
    expect(find(report, "metadata").pass).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.failing).toContain("metadata");
  });

  it("flags a control-flow primitive (BLOCKING, constitution VIII)", async () => {
    const report = await check(draft({ name: "While" }));
    expect(find(report, "total-functional").pass).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.failing).toContain("total-functional");
  });

  it("warns (non-blocking) on schema↔template incoherence", async () => {
    // Schema declares `subtitle`; the template never references it.
    const schemaSource = `import { z } from "zod";
export const Mismatch = z
  .object({
    primitive: z.literal("Mismatch"),
    id: z.string(),
    subtitle: z.string(),
  })
  .strict();
export const MismatchMeta = {
  primitive: "Mismatch", version: "0.1.0", intent: "real intent",
  whenToUse: "x", whenNotToUse: ["use something else"], fieldGuidance: {},
  examples: [{ primitive: "Mismatch", id: "demo", subtitle: "s" }],
};
`;
    const report = await check(
      draft({ name: "Mismatch", schemaSource, templateSource: `// {{id}} only\n` }),
    );
    const coherence = find(report, "coherence");
    expect(coherence.pass).toBe(false);
    expect(coherence.severity).toBe("warn");
    // coherence is advisory — it does NOT block promotion on its own.
    expect(report.ok).toBe(true);
  });
});
