// v0.2 deferral #2 — Prep loader wired into the render phase end-to-end
// (design "Prep Loader — Minimal Design" §5-6).
//
// Uses a real `compose()` call against a fixture workspace with a
// `hero.prep.ts` that imports a relative-import sibling helper (the shape
// that lets sifir's theme-css.ts import pure siblings) and reads
// `ctx.tokens` from `tokens.json`. Verifies:
//   - prep output reaches the template, including derived fields not present
//     on the node itself;
//   - merge semantics: prep keys win over node keys, `spec_path` stays
//     engine-reserved regardless of what prep returns;
//   - a rich error thrown by prep-authored code reaches the caller verbatim,
//     tagged with the failing stage (§4).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFixture, type Fixture } from "../helpers/fixture.js";

const CATALOG_INDEX = `import { z } from "zod";

export const Hero = z.object({
  primitive: z.literal("Hero"),
  id: z.string(),
  title: z.string().min(1),
  level: z.number(),
}).strict();

export const HeroMeta = {
  primitive: "Hero",
  version: "1.0.0",
  intent: "Top-of-page focal block.",
  whenToUse: "Page hero anchoring the section.",
  whenNotToUse: [],
  fieldGuidance: { title: "1-line action-oriented" },
  examples: [{ primitive: "Hero", id: "demo", title: "Hello world", level: 1 }],
} as const;

export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero]);
`;

const OUTPUT_MAP = `export default {
  byPrimitive: {
    Hero: (node) => [{ path: "src/heroes/" + node.id + ".ts", language: "ts" }],
  },
};
`;

const HERO_TEMPLATE = `// from: spec={{spec_path}} primitive=Hero id={{id}}
export const hero_{{id}} = {
  title: {{{json title}}},
  shout: {{{json shout}}},
  complexity: {{{json complexity}}},
  brand: {{{json brand}}},
  spec_path: {{{json spec_path}}}
};
`;

const SHOUT_HELPER = `export function shout(text) {
  return text.toUpperCase() + "!";
}
`;

const HERO_PREP = `import { shout } from "./helpers/shout.js";

export default (node, ctx) => {
  return {
    shout: shout(node.title),
    complexity: node.level * 2,
    brand: ctx.tokens.brand ?? "none",
    spec_path: "PREP-TRIED-TO-OVERRIDE-THIS",
  };
};
`;

function makeHeroFixture(): Fixture {
  const fixture = makeFixture({
    files: {
      "catalog/index.ts": CATALOG_INDEX,
      "output.map.ts": OUTPUT_MAP,
      "templates/hero.ts.hbs": HERO_TEMPLATE,
      "templates/hero.prep.ts": HERO_PREP,
      "templates/helpers/shout.ts": SHOUT_HELPER,
    },
  });
  writeFileSync(
    join(fixture.workspaceRoot, "tokens.json"),
    JSON.stringify({ brand: "indigo" }),
    "utf8",
  );
  return fixture;
}

describe("prep loader wired into render (v0.2 deferral #2)", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeHeroFixture();
  });

  afterEach(() => fixture.cleanup());

  it("merges prep output over the node, with relative-import bundling and ctx.tokens", async () => {
    const { compose } = await import("@composer/core");

    const result = await compose(
      fixture.projectRoot,
      "hero-1",
      { primitive: "Hero", id: "hero-1", title: "hello world", level: 3 },
      { surface: "cli" },
    );

    expect(result.audit.ok).toBe(true);
    expect(result.files_written).toHaveLength(1);
    const out = result.files_written[0]!;
    expect(out.path).toBe("src/heroes/hero-1.ts");

    const generated = readFileSync(join(fixture.projectRoot, out.path), "utf8");

    // Derived-only fields (not present on the node) reached the template.
    expect(generated).toContain('shout: "HELLO WORLD!"');
    expect(generated).toContain("complexity: 6");
    // ctx.tokens (from workspace tokens.json) reached the prep function.
    expect(generated).toContain('brand: "indigo"');
    // spec_path is engine-reserved: prep's attempt to override it is discarded.
    expect(generated).toContain('spec_path: "specs/hero-1.json"');
    expect(generated).not.toContain("PREP-TRIED-TO-OVERRIDE-THIS");
  });

  it("prep keys win over node keys of the same name", async () => {
    // Overwrite the prep for just this test: also echo back a `title` field
    // that differs from the node's, to prove merge order (prep wins).
    writeFileSync(
      join(fixture.workspaceRoot, "templates", "hero.prep.ts"),
      `import { shout } from "./helpers/shout.js";
export default (node, ctx) => ({
  title: "OVERRIDDEN-BY-PREP",
  shout: shout(node.title),
  complexity: node.level * 2,
  brand: ctx.tokens.brand ?? "none",
});
`,
      "utf8",
    );
    writeFileSync(
      join(fixture.workspaceRoot, "templates", "hero.ts.hbs"),
      `export const hero_{{id}} = { title: {{{json title}}} };\n`,
      "utf8",
    );

    const { compose } = await import("@composer/core");
    const result = await compose(
      fixture.projectRoot,
      "hero-2",
      { primitive: "Hero", id: "hero-2", title: "original-node-title", level: 1 },
      { surface: "cli" },
    );

    const out = result.files_written[0]!;
    const generated = readFileSync(join(fixture.projectRoot, out.path), "utf8");
    expect(generated).toContain('title: "OVERRIDDEN-BY-PREP"');
    expect(generated).not.toContain("original-node-title");
  });

  it("propagates a rich error thrown by prep-authored code verbatim, tagged with its stage", async () => {
    const richMessage =
      "Contrast guard: lightness 0.92 fails AA against background — try lightness<=0.78.";
    writeFileSync(
      join(fixture.workspaceRoot, "templates", "hero.prep.ts"),
      `export default (node, ctx) => {
  throw new Error(${JSON.stringify(richMessage)});
};
`,
      "utf8",
    );

    const { compose, RenderFailedError } = await import("@composer/core");

    const promise = compose(
      fixture.projectRoot,
      "hero-3",
      { primitive: "Hero", id: "hero-3", title: "x", level: 1 },
      { surface: "cli" },
    );

    await expect(promise).rejects.toBeInstanceOf(RenderFailedError);
    await expect(promise).rejects.toThrow(
      new RegExp(
        `Prep failed for Hero \\(node hero-3\\) in hero\\.prep\\.ts \\[exec\\]: ${richMessage.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}`,
      ),
    );
  });

  it("reports a non-relative import at load time as a RenderFailedError tagged [load]", async () => {
    writeFileSync(
      join(fixture.workspaceRoot, "templates", "hero.prep.ts"),
      `import { z } from "zod";
export default (node) => ({ x: typeof z });
`,
      "utf8",
    );

    const { compose, RenderFailedError } = await import("@composer/core");

    const promise = compose(
      fixture.projectRoot,
      "hero-4",
      { primitive: "Hero", id: "hero-4", title: "x", level: 1 },
      { surface: "cli" },
    );

    await expect(promise).rejects.toBeInstanceOf(RenderFailedError);
    await expect(promise).rejects.toThrow(/\[load\]/);
  });
});
