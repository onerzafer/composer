// T009 / 004 US1 — promote a grammar-authored draft through the SHARED 003 gate,
// then compose a spec that uses it → real source (SC-001). Proves a primitive
// stood up entirely from an interview-drafted schema/template (no from-scratch
// hand-authoring) composes like any hand-written one (FR-009).
//
// Sequence: stage (grammar-kit) → promote (003 gate, quality passes) → the human
// wires the promoted primitive into the catalog union (catalog ownership,
// constitution II) → compose emits source.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
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
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");

function makeProject(): {
  projectRoot: string;
  workspaceRoot: string;
  cleanup: () => void;
} {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-grammar-promote-"));
  const workspaceRoot = join(projectRoot, "design");
  mkdirSync(join(workspaceRoot, "catalog", "primitives"), { recursive: true });
  mkdirSync(join(workspaceRoot, "catalog", "ingested"), { recursive: true });
  mkdirSync(join(workspaceRoot, "templates"), { recursive: true });
  mkdirSync(join(workspaceRoot, "specs"), { recursive: true });

  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      { name: "grammar-fixture", version: "0.0.0", private: true, type: "module" },
      null,
      2,
    ),
    "utf8",
  );
  // Catalog TS (index.ts / primitives) + output.map resolve zod + adapter-kit
  // through the symlinked tests workspace node_modules.
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");

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

describe("grammar promote → compose (004 US1 / SC-001 / FR-009)", () => {
  let proj: ReturnType<typeof makeProject>;

  beforeEach(() => {
    proj = makeProject();
  });

  afterEach(() => proj.cleanup());

  it(
    "promotes a drafted Greeting and composes a spec that uses it",
    { timeout: 60_000 },
    async () => {
      const { stageDraft } = await import("@composer/grammar-kit");
      const { greetingDraft } = await import("../fixtures/grammar-kit/expected-draft.js");
      const { promote } = await import("@composer/cli");
      const { compose } = await import("@composer/core");

      // 1. Author → stage.
      stageDraft({ projectRoot: proj.projectRoot, draft: greetingDraft });

      // 2. Promote via the shared 003 gate — the conforming draft passes quality.
      const promoted = await promote({ projectRoot: proj.projectRoot, draftName: "Greeting" });
      expect(promoted.ok).toBe(true);
      expect(promoted.qualityOverride).toBeUndefined(); // passed cleanly, no override
      expect(existsSync(join(proj.workspaceRoot, "catalog", "primitives", "greeting.ts"))).toBe(true);
      expect(existsSync(join(proj.workspaceRoot, "templates", "greeting.ts.hbs"))).toBe(true);

      // 3. Human wires the promoted primitive into the catalog union + output map
      //    (catalog ownership — constitution II; the schema/template were NOT
      //    hand-authored, they came from the draft).
      writeFileSync(
        join(proj.workspaceRoot, "catalog", "index.ts"),
        `import { z } from "zod";
import { Greeting, GreetingMeta } from "./primitives/greeting.js";
export { Greeting, GreetingMeta };
export const PrimitiveNode = z.discriminatedUnion("primitive", [Greeting]);
`,
        "utf8",
      );
      writeFileSync(
        join(proj.workspaceRoot, "output.map.ts"),
        `const outputMap = {
  byPrimitive: {
    Greeting: (node) => [
      { path: \`src/greetings/\${node.id}.ts\`, language: "ts", policy: "overwrite" },
    ],
  },
  specsDir: "specs",
};
export default outputMap;
`,
        "utf8",
      );

      // 4. Compose a spec that uses the promoted primitive → real source.
      const result = await compose(
        proj.projectRoot,
        "world",
        { primitive: "Greeting", id: "world", name: "World" },
        { surface: "cli" },
      );
      expect(result.audit.ok).toBe(true);
      expect(result.files_written).toHaveLength(1);

      const out = result.files_written[0]!;
      expect(out.path).toBe("src/greetings/world.ts");
      const generated = readFileSync(join(proj.projectRoot, out.path), "utf8");
      expect(generated).toContain("Hello, World!");
      expect(generated).toContain("greeting_world");
    },
  );

  it(
    "refuses a grammar-authored draft that collides with an existing primitive (US3 #1)",
    { timeout: 60_000 },
    async () => {
      const { stageDraft } = await import("@composer/grammar-kit");
      const { greetingDraft } = await import("../fixtures/grammar-kit/expected-draft.js");
      const { promote } = await import("@composer/cli");

      // A live primitive of the same (lowercased) name already exists.
      writeFileSync(
        join(proj.workspaceRoot, "catalog", "primitives", "greeting.ts"),
        `export const Greeting = "already live";\n`,
        "utf8",
      );

      // Authoring the same name and promoting must be refused (reuses 003's
      // collision check — the collision is a hard refusal `--force` does NOT bypass).
      stageDraft({ projectRoot: proj.projectRoot, draft: greetingDraft });
      await expect(
        promote({ projectRoot: proj.projectRoot, draftName: "Greeting", force: true }),
      ).rejects.toThrow(/already exists|collision/i);
    },
  );
});
