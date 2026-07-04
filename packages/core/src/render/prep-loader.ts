// v0.2 deferral #2 — Prep loader.
//
// Bundles a `<primitive>.prep.ts` file (plus its relative-import graph — see
// design "Prep Loader — Minimal Design" §1) into a single self-contained
// source string ready for `runPrepInSandbox`. Deliberately does NOT use
// `tsImport`: importing the module would execute its top-level scope in the
// host realm *before* sandboxing, and a prep file's module scope could touch
// fs/network unsandboxed (violates FR-011). Transpile-to-source keeps 100%
// of prep execution inside the vm.
//
// Pipeline (§2):
//   1. esbuild bundle, resolving only relative imports (bare/package/node:*
//      imports rejected at resolve time — stage "load").
//   2. Rewrite the bundle's `export default` into an IIFE that RETURNS the
//      exported value (never invokes it) — `runPrepInSandbox` still does the
//      invoking, so its `(${source})(node, { slots, tokens })` wrapping is
//      unchanged.
//   3. Static safety check against the bundled+wrapped output (stage
//      "unsafe") — catches banned identifiers smuggled through helper files,
//      not just the entry file.
//   4. Cache by prepPath for the process lifetime (mtime invalidation rides
//      deferral #1's catalog-cache work, not this one).

import { build as esbuildBuild } from "esbuild";
import type { Plugin, PluginBuild } from "esbuild";
import { assertPrepSourceSafe, PrepStageError } from "./sandbox.js";

export interface LoadedPrep {
  /** A JS expression string that EVALUATES TO the prep function value (it is
   * not itself a call — `runPrepInSandbox` performs the invocation). */
  source: string;
}

/** esbuild resolve plugin: reject any import that isn't relative (`./` or
 * `../`). Bare package imports and `node:*` imports are banned — prep
 * executes inside a sandboxed vm realm with no module resolver, so only
 * content that bundles into one self-contained source string is allowed. */
const relativeImportsOnly: Plugin = {
  name: "composer-prep-relative-imports-only",
  setup(pluginBuild: PluginBuild) {
    pluginBuild.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      if (args.path.startsWith("./") || args.path.startsWith("../")) return undefined;
      return {
        errors: [
          {
            text:
              `Prep file imports "${args.path}" — only relative imports (./ or ../) are ` +
              `allowed in prep sources. Bare package imports and node:* built-ins are banned: ` +
              `prep executes in a sandboxed vm with no module resolution.`,
          },
        ],
      };
    });
  },
};

/**
 * Rewrite an esbuild ESM bundle's trailing export clause — either a direct
 * `export default <expr>;` or (the common case once anything is bundled)
 * `export { localName as default };` — into an IIFE that returns the
 * exported value. The `export` keyword itself must be gone before the string
 * reaches `runInNewContext`, which evaluates plain script text, not a module.
 */
function wrapDefaultExport(bundled: string, prepPath: string): string {
  const namedExportClause = /export\s*\{([^}]*)\}\s*;?\s*$/;
  const clauseMatch = bundled.match(namedExportClause);
  if (clauseMatch && typeof clauseMatch.index === "number") {
    const bindingMatch = clauseMatch[1]?.match(/([A-Za-z_$][\w$]*)\s+as\s+default\b/);
    if (bindingMatch?.[1]) {
      const body = bundled.slice(0, clauseMatch.index).trimEnd();
      return `(() => {\n${body}\nreturn ${bindingMatch[1]};\n})()`;
    }
  }

  const directDefault = /export\s+default\s+/;
  if (directDefault.test(bundled)) {
    return `(() => {\n${bundled.replace(directDefault, "return ")}\n})()`;
  }

  throw new PrepStageError(
    "load",
    `Prep file has no default export: ${prepPath}. Prep must ` +
      "`export default (node, ctx) => {...}`.",
  );
}

const PREP_CACHE = new Map<string, LoadedPrep>();

/**
 * Bundle + validate a `<primitive>.prep.ts` file into sandbox-ready source.
 * Cached by `prepPath` for the process lifetime.
 */
export async function loadPrep(prepPath: string): Promise<LoadedPrep> {
  const cached = PREP_CACHE.get(prepPath);
  if (cached) return cached;

  let bundled: string;
  try {
    const result = await esbuildBuild({
      entryPoints: [prepPath],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      plugins: [relativeImportsOnly],
      logLevel: "silent",
    });
    const output = result.outputFiles[0];
    if (!output) {
      throw new Error("esbuild produced no output for prep bundle.");
    }
    bundled = output.text;
  } catch (err) {
    if (err instanceof PrepStageError) throw err;
    throw new PrepStageError(
      "load",
      `Failed to bundle prep file ${prepPath}: ${(err as Error).message}`,
      err,
    );
  }

  const wrapped = wrapDefaultExport(bundled, prepPath);

  try {
    assertPrepSourceSafe(wrapped);
  } catch (err) {
    throw new PrepStageError("unsafe", (err as Error).message, err);
  }

  const loaded: LoadedPrep = { source: wrapped };
  PREP_CACHE.set(prepPath, loaded);
  return loaded;
}

/** Test-only escape hatch: clears the process-local prep bundle cache. */
export function _resetPrepCacheForTests(): void {
  PREP_CACHE.clear();
}
