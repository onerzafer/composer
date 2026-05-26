// T077/T078 — Adapter `extends:` resolution + cache + cycle detection.
//
// When composer.json declares `extends: "<pkg>@<major>"`, the engine must:
//   1. Resolve the parent package from node_modules (via Node's resolver).
//   2. Walk the parent's own composer.json (if any) to build the full
//      extends-chain and reject cycles (FR-008).
//   3. Materialize the parent's catalog/templates/output.map/audit/bootstrap
//      into `.composer/cache/parent/<pkg-name>/` for stable referencing.
//
// v0.1 scope: parent layering merges templates by filename (project wins) and
// audit chains parent-before-project. Primitive-shadow detection lives in
// `composer doctor` (T094) — see the catalog merge note in compile.ts.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ComposerConfigError, validateComposerConfig } from "./validate-config.js";

/** Strips a trailing `@<digits>` (or semver-ish) pin to get the package name. */
export function stripVersionPin(spec: string): string {
  const lastAt = spec.lastIndexOf("@");
  if (lastAt > 0 && /^[0-9^~<>=]/.test(spec.slice(lastAt + 1))) {
    return spec.slice(0, lastAt);
  }
  return spec;
}

export interface ResolvedParent {
  /** Full package name (no version pin). */
  name: string;
  /** Installed version from the parent's package.json. */
  version: string;
  /** Absolute path to the installed parent package root. */
  packageRoot: string;
  /** Absolute path to the cached parent inside `.composer/cache/parent/<safeName>/`. */
  cacheRoot: string;
  /** Has parent/catalog/index.ts. */
  hasCatalog: boolean;
  /** Has parent/templates/ with at least one .hbs. */
  hasTemplates: boolean;
  /** Has parent/output.map.ts. */
  hasOutputMap: boolean;
  /** Has parent/audit.ts (or .js when shipped compiled). */
  hasAudit: boolean;
}

export class ExtendsResolutionError extends ComposerConfigError {
  constructor(message: string) {
    super(message);
    this.name = "ExtendsResolutionError";
  }
}

export class ExtendsCycleError extends ComposerConfigError {
  constructor(
    message: string,
    public readonly chain: string[],
  ) {
    super(message);
    this.name = "ExtendsCycleError";
  }
}

/**
 * Resolve an `extends:` spec to an absolute package path + version. Throws
 * `ExtendsResolutionError` if the package isn't installed.
 *
 * Pure resolution — does no caching, no cycle detection. Callers wanting the
 * full chain should use `walkExtendsChain` + `materializeParent` separately.
 */
export function resolveParentPackage(
  projectRoot: string,
  extendsSpec: string,
): { name: string; version: string; packageRoot: string } {
  const name = stripVersionPin(extendsSpec);
  const require_ = createRequire(join(projectRoot, "package.json"));
  let pkgJsonPath: string;
  try {
    pkgJsonPath = require_.resolve(`${name}/package.json`);
  } catch (err) {
    throw new ExtendsResolutionError(
      `extends adapter "${extendsSpec}" is not installed under ${projectRoot}/node_modules. ` +
        `Install it first (e.g. \`npm install ${extendsSpec}\`). ` +
        `Original resolver error: ${(err as Error).message}`,
    );
  }
  const packageRoot = dirname(pkgJsonPath);
  const meta = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { version?: string };
  if (!meta.version) {
    throw new ExtendsResolutionError(
      `extends adapter "${name}" at ${packageRoot} has no version in package.json`,
    );
  }
  return { name, version: meta.version, packageRoot };
}

/**
 * Walk the extends-chain by following `<pkg>/composer.json` if present,
 * detecting cycles via name repetition. Returns the full chain
 * `[root, parent, grandparent, …]` ordered from project outward.
 *
 * T078 — cycle detection: throws `ExtendsCycleError` if any name repeats.
 */
export function walkExtendsChain(projectRoot: string, extendsSpec: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let currentRoot = projectRoot;
  let currentSpec: string | undefined = extendsSpec;

  // Defensive depth cap — should never matter on a sane registry.
  for (let depth = 0; depth < 32 && currentSpec; depth++) {
    const name = stripVersionPin(currentSpec);
    if (seen.has(name)) {
      throw new ExtendsCycleError(
        `extends cycle detected: ${[...chain, name].join(" → ")} (already visited "${name}")`,
        [...chain, name],
      );
    }
    seen.add(name);
    chain.push(name);

    const { packageRoot } = resolveParentPackage(currentRoot, currentSpec);
    const parentComposerJson = join(packageRoot, "composer.json");
    if (!existsSync(parentComposerJson)) break;
    let parentCfg: ReturnType<typeof validateComposerConfig>;
    try {
      const raw = JSON.parse(readFileSync(parentComposerJson, "utf8")) as unknown;
      parentCfg = validateComposerConfig(raw);
    } catch (err) {
      throw new ExtendsResolutionError(
        `Parent adapter ${name} ships an invalid composer.json: ${(err as Error).message}`,
      );
    }
    currentRoot = packageRoot;
    currentSpec = parentCfg.extends ?? undefined;
  }

  return chain;
}

/**
 * Resolve, cycle-check, and materialize the parent adapter into
 * `.composer/cache/parent/<safeName>/`. Returns a `ResolvedParent` describing
 * which artifacts the parent ships (callers branch on the `has*` flags).
 *
 * The cache key is just the package name. v0.2 will key by version mtime and
 * support a `--refresh-parent` flag (T099); v0.1 always re-materializes (the
 * file copy is cheap and we always need a fresh view).
 */
/** Process-local idempotence guard. Each (cacheRoot, version) pair is
 * materialized at most once per process. Re-copying on every compose triggers
 * filesystem activity that can deadlock `tsx`'s loader cache when modules
 * have been previously imported from the same project (the 3rd-compose hang
 * we surfaced wiring T077). */
const MATERIALIZED = new Map<string, string>();

export function resolveAndCacheParent(
  projectRoot: string,
  extendsSpec: string,
): ResolvedParent {
  // T078 — run the cycle detector first so the error message names the chain.
  walkExtendsChain(projectRoot, extendsSpec);

  const { name, version, packageRoot } = resolveParentPackage(projectRoot, extendsSpec);

  const safeName = name.replace(/[/@]/g, "_");
  const cacheRoot = join(projectRoot, ".composer", "cache", "parent", safeName);
  mkdirSync(cacheRoot, { recursive: true });

  const cacheKey = `${cacheRoot}@${version}`;
  const alreadyMaterialized = MATERIALIZED.get(cacheKey) === version;

  if (!alreadyMaterialized) {
    const copies: Array<[string, "dir" | "file"]> = [
      ["catalog", "dir"],
      ["templates", "dir"],
      ["output.map.ts", "file"],
      ["output.map.js", "file"],
      ["output.map.js.map", "file"],
      ["audit.ts", "file"],
      ["audit.js", "file"],
      ["audit.js.map", "file"],
      ["bootstrap.ts", "file"],
      ["bootstrap.js", "file"],
      ["bootstrap.js.map", "file"],
    ];
    for (const [rel, kind] of copies) {
      const src = join(packageRoot, rel);
      if (!existsSync(src)) continue;
      if (kind === "dir" && statSync(src).isDirectory()) {
        cpSync(src, join(cacheRoot, rel), { recursive: true });
      } else if (kind === "file" && statSync(src).isFile()) {
        cpSync(src, join(cacheRoot, rel));
      }
    }
    writeFileSync(
      join(cacheRoot, "manifest.json"),
      JSON.stringify(
        { name, version, package_root: packageRoot, materialized_at: new Date().toISOString() },
        null,
        2,
      ),
      "utf8",
    );
    MATERIALIZED.set(cacheKey, version);
  }

  return {
    name,
    version,
    packageRoot,
    cacheRoot,
    hasCatalog: existsSync(join(cacheRoot, "catalog", "index.ts")),
    hasTemplates: existsSync(join(cacheRoot, "templates")),
    hasOutputMap:
      existsSync(join(cacheRoot, "output.map.ts")) ||
      existsSync(join(cacheRoot, "output.map.js")),
    hasAudit:
      existsSync(join(cacheRoot, "audit.ts")) || existsSync(join(cacheRoot, "audit.js")),
  };
}
