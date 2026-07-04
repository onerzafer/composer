// v0.2 deferral #2 — Prep loader (design "Prep Loader — Minimal Design" §1-2).
//
// Verifies: relative-import bundling (the one non-trivial addition — this is
// what lets sifir's theme-css.ts import pure siblings like `expandComplexity`
// without a rewrite), the `ctx.tokens` injection channel, the three load-time
// rejections (bare import, node:* import, no default export), a banned
// identifier smuggled through a helper file (checked post-bundle, not just
// against the entry file), and process-lifetime caching by prepPath.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  _resetPrepCacheForTests,
  loadPrep,
  PrepStageError,
  runPrepInSandbox,
} from "@composer/core";

let dir: string;

function writeFile(relPath: string, content: string): string {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "composer-prep-loader-"));
  _resetPrepCacheForTests();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadPrep (v0.2 deferral #2)", () => {
  it("bundles a self-contained prep file into runnable source", async () => {
    const prepPath = writeFile(
      "hero.prep.ts",
      `export default (node, ctx) => ({ title: node.title.toUpperCase() });\n`,
    );

    const { source } = await loadPrep(prepPath);
    const result = await runPrepInSandbox(source, { title: "hello" }, { slots: {}, tokens: {} });

    expect(result).toEqual({ title: "HELLO" });
  });

  it("bundles a relative-import helper into the prep source (sifir theme-css shape)", async () => {
    writeFile(
      "helpers/complexity.ts",
      `export function expandComplexity(level) { return level * 2; }\n`,
    );
    const prepPath = writeFile(
      "theme.prep.ts",
      `import { expandComplexity } from "./helpers/complexity.js";
export default (node, ctx) => ({ complexity: expandComplexity(node.level) });\n`,
    );

    const { source } = await loadPrep(prepPath);
    const result = await runPrepInSandbox(source, { level: 3 }, { slots: {}, tokens: {} });

    expect(result).toEqual({ complexity: 6 });
  });

  it("injects the engine token map through ctx.tokens", async () => {
    const prepPath = writeFile(
      "with-tokens.prep.ts",
      `export default (node, ctx) => ({ color: ctx.tokens.brand });\n`,
    );

    const { source } = await loadPrep(prepPath);
    const result = await runPrepInSandbox(source, {}, { slots: {}, tokens: { brand: "indigo" } });

    expect(result).toEqual({ color: "indigo" });
  });

  it("rejects a bare package import at load time", async () => {
    const prepPath = writeFile(
      "bare-import.prep.ts",
      `import { z } from "zod";
export default (node) => ({ x: typeof z });\n`,
    );

    await expect(loadPrep(prepPath)).rejects.toBeInstanceOf(PrepStageError);
    await expect(loadPrep(prepPath)).rejects.toThrow(/only relative imports/);
    const err = await loadPrep(prepPath).catch((e: unknown) => e as PrepStageError);
    expect(err.stage).toBe("load");
  });

  it("rejects a node:* import at load time", async () => {
    const prepPath = writeFile(
      "node-import.prep.ts",
      `import { readFileSync } from "node:fs";
export default (node) => ({ x: readFileSync("/etc/hosts", "utf8") });\n`,
    );

    const err = await loadPrep(prepPath).catch((e: unknown) => e as PrepStageError);
    expect(err).toBeInstanceOf(PrepStageError);
    expect(err.stage).toBe("load");
    expect(err.message).toMatch(/only relative imports/);
  });

  it("rejects a prep file with no default export", async () => {
    const prepPath = writeFile(
      "no-default.prep.ts",
      `export const notDefault = (node) => ({ x: 1 });\n`,
    );

    const err = await loadPrep(prepPath).catch((e: unknown) => e as PrepStageError);
    expect(err).toBeInstanceOf(PrepStageError);
    expect(err.stage).toBe("load");
    expect(err.message).toMatch(/no default export/);
  });

  it("rejects a banned identifier smuggled through a relative-import helper", async () => {
    // `eval` here is deliberate fixture content: proving the static banned-
    // identifier check catches it (never executed — load fails before exec).
    writeFile("helpers/sneaky.ts", `export function evil() { return eval("1+1"); }\n`);
    const prepPath = writeFile(
      "smuggled.prep.ts",
      `import { evil } from "./helpers/sneaky.js";
export default (node) => ({ x: evil() });\n`,
    );

    const err = await loadPrep(prepPath).catch((e: unknown) => e as PrepStageError);
    expect(err).toBeInstanceOf(PrepStageError);
    expect(err.stage).toBe("unsafe");
    expect(err.message).toMatch(/disallowed identifier/);
  });

  it("caches the bundled source by prepPath for the process lifetime", async () => {
    const prepPath = writeFile("cached.prep.ts", `export default (node) => ({ x: 1 });\n`);

    const first = await loadPrep(prepPath);
    const second = await loadPrep(prepPath);

    expect(second).toBe(first);
  });
});
