// T0XX — Resolve adapter-internal `@/*`-style tsconfig path aliases wherever
// this engine copies an adapter's catalog/templates/output.map/audit onto
// disk verbatim.
//
// Problem: an adapter package MAY organize its own catalog/templates/
// output.map.ts/audit.ts using a tsconfig `paths` alias (commonly `"@/*"`)
// declared in its OWN `tsconfig.json`, resolved by its own build/typecheck
// tooling. TypeScript's `paths` is a type-checker-only convention that is
// never rewritten into emitted/loaded module specifiers, and the `tsx`
// programmatic API this engine loads catalog/output-map/audit modules with
// (`tsImport`, `tsx/esm/api`) does not apply tsconfig `paths` remapping
// either — confirmed empirically two ways: (1) passing
// `{ tsconfig: <path-to-a-tsconfig-declaring-paths> }` still fails to
// resolve a bare alias specifier, and (2) even the auto-discovery tsx falls
// back to when no explicit tsconfig is given refuses to apply `paths` at all
// once the importing file's resolved URL sits under a `node_modules`
// segment — the exact shape every externally-installed adapter has once a
// real consumer runs `npm install`. So a workspace built from (or extending)
// an alias-using adapter fails at compose time with Node's own
// bare-specifier error (`Cannot find package '@/core' imported from
// .../catalog/index.ts`) for every single spec.
//
// Fix: two call sites copy adapter content onto disk before this engine
// later `tsImport`s it —
//   - `composer init --extends <adapter>` copies catalog/templates/
//     output.map.ts once into the new workspace itself (init.ts's
//     self-contained copy model).
//   - `extends:`-style parent-layering re-materializes catalog/templates/
//     output.map/audit into `.composer/cache/parent/<safeName>/` on every
//     compose (workspace/extends.ts's `resolveAndCacheParent`).
// In both cases the copy already preserves each copied file's position
// relative to the adapter package root (`catalog/` copies to `catalog/`,
// `audit.ts` copies to `audit.ts`, etc.), so the relative path between any
// two files that are BOTH inside that copied set is identical before and
// after the copy. That means any adapter-declared alias whose target
// resolves inside catalog/templates/output.map.ts/audit.ts can be
// mechanically rewritten, post-copy, into an equivalent relative specifier —
// no runtime tsconfig discovery, no new module-loader hook, and no
// participation required from the (several) call sites that later
// `tsImport` these files. This keeps the fix at the copy boundary: every
// copy this engine makes of adapter content is fully self-contained,
// including its imports.
//
// Scope: only bare specifiers matching a `paths` pattern declared in the
// adapter's own `<pkgPath>/tsconfig.json` are considered. Relative
// specifiers and real (node_modules) package specifiers are left untouched.
// An alias whose resolved target falls outside catalog/templates/
// output.map.ts/audit.ts is out of scope — the adapter would need the file
// copied too (e.g. a sibling `src/`), which this engine has no way to know
// is safe/intended — so that case raises a clear, descriptive error instead
// of silently emitting a broken import that would only fail later at
// compose time with a much more confusing message.
// Similarly, `paths` declared in a config the adapter's tsconfig `extends`
// (rather than in the file itself) are not read — adapters are expected to
// declare their own aliases directly, matching the copy-time contract above.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath, sep } from "node:path";

interface AdapterTsPaths {
  /** Absolute directory `paths` targets are resolved relative to. */
  baseUrl: string;
  /** Raw `compilerOptions.paths` map, e.g. `{ "@/*": ["./*"] }`. */
  paths: Record<string, string[]>;
}

interface AliasMatch {
  pattern: string;
  targets: string[];
  /** Wildcard capture for a `*`-patterned key; null for an exact-key match. */
  capture: string | null;
}

/** First path segment of each copied root this engine considers a valid
 * alias-rewrite target — anything an adapter alias resolves to outside one
 * of these is out of scope (see header comment). `output.map.ts` and
 * `audit.ts` are themselves single files, so they're matched as a whole
 * relative path rather than a directory segment. */
const VALID_TARGET_ROOTS = new Set(["catalog", "templates"]);
const VALID_TARGET_FILES = new Set(["output.map.ts", "audit.ts"]);

/**
 * Read `compilerOptions.baseUrl` + `paths` directly from `<pkgPath>/tsconfig.json`.
 * Returns null when the adapter has no tsconfig.json, it fails to parse, or it
 * declares no `paths` — all "nothing to do" cases, not errors.
 */
function loadAdapterTsPaths(pkgPath: string): AdapterTsPaths | null {
  const tsconfigPath = join(pkgPath, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  } catch {
    return null;
  }

  const compilerOptions = (parsed as { compilerOptions?: Record<string, unknown> })
    .compilerOptions;
  const paths = compilerOptions?.["paths"];
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) return null;

  const baseUrlRel = compilerOptions?.["baseUrl"];
  const baseUrl = resolvePath(pkgPath, typeof baseUrlRel === "string" ? baseUrlRel : ".");

  return { baseUrl, paths: paths as Record<string, string[]> };
}

/** TS `paths` matching: exact keys first, then the first matching `*` pattern. */
function matchAlias(specifier: string, paths: Record<string, string[]>): AliasMatch | null {
  if (Object.prototype.hasOwnProperty.call(paths, specifier)) {
    return { pattern: specifier, targets: paths[specifier]!, capture: null };
  }
  for (const pattern of Object.keys(paths)) {
    const starIdx = pattern.indexOf("*");
    if (starIdx === -1) continue;
    const prefix = pattern.slice(0, starIdx);
    const suffix = pattern.slice(starIdx + 1);
    if (
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix) &&
      specifier.length >= prefix.length + suffix.length
    ) {
      const capture = specifier.slice(prefix.length, specifier.length - suffix.length);
      return { pattern, targets: paths[pattern]!, capture };
    }
  }
  return null;
}

/** Probe candidate file paths the way Node/TS module resolution would. */
function probeFile(absNoExt: string): string | null {
  const candidates = [
    absNoExt,
    `${absNoExt}.ts`,
    `${absNoExt}.tsx`,
    join(absNoExt, "index.ts"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function resolveAliasTarget(
  baseUrl: string,
  targets: string[],
  capture: string | null,
): string | null {
  for (const target of targets) {
    const expanded = capture !== null ? target.replace("*", capture) : target;
    const found = probeFile(resolvePath(baseUrl, expanded));
    if (found) return found;
  }
  return null;
}

function collectTsFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      collectTsFiles(abs, out);
    } else if (stat.isFile() && entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(abs);
    }
  }
}

/**
 * Rewrite bare specifiers in `source` matched by `resolveSpecifier` across the
 * three import/export forms adapter code plausibly uses: `import/export ...
 * from "spec"`, side-effect `import "spec";`, and dynamic `import("spec")`.
 * `resolveSpecifier` returns the replacement text, or null to leave a
 * specifier untouched (not a paths match — most specifiers, e.g. "zod").
 */
function rewriteSpecifiers(
  source: string,
  resolveSpecifier: (specifier: string) => string | null,
): { text: string; changed: boolean } {
  let changed = false;
  // Named groups (rather than positional captures) so the replace callback
  // below doesn't have to guess argument positions — the three forms have
  // different group counts (only the last two have a trailing `post` group),
  // and `String.replace`'s callback always appends the match offset and full
  // string as trailing positional args, which would otherwise collide with a
  // missing `post` capture and corrupt the rewritten specifier.
  const forms: RegExp[] = [
    // import ... from "spec" / export ... from "spec"
    /(?<pre>\bfrom\s+)(?<quote>['"])(?<spec>[^'"]+)\k<quote>/g,
    // import "spec";  (side-effect only)
    /(?<pre>\bimport\s+)(?<quote>['"])(?<spec>[^'"]+)\k<quote>(?<post>\s*;)/g,
    // import("spec")  (dynamic)
    /(?<pre>\bimport\s*\(\s*)(?<quote>['"])(?<spec>[^'"]+)\k<quote>(?<post>\s*\))/g,
  ];

  let text = source;
  for (const form of forms) {
    text = text.replace(form, (whole: string, ...rest: unknown[]) => {
      const groups = rest[rest.length - 1] as {
        pre: string;
        quote: string;
        spec: string;
        post?: string;
      };
      const replacement = resolveSpecifier(groups.spec);
      if (replacement === null) return whole;
      changed = true;
      return `${groups.pre}${groups.quote}${replacement}${groups.quote}${groups.post ?? ""}`;
    });
  }
  return { text, changed };
}

/**
 * Resolve and rewrite adapter-internal `paths` aliases across the copied
 * catalog/templates/output.map.ts/audit.ts under `destRoot`, so the copy is
 * fully self-contained. `pkgPath` is the adapter package's own installed
 * root (used to read its tsconfig.json and to resolve alias targets against
 * it) — for `init --extends` this is the same package the copy was taken
 * from; for `extends:` parent-layering this is the original
 * `node_modules/<adapter>` install root, while `destRoot` is the
 * `.composer/cache/parent/<safeName>/` materialization (see extends.ts).
 *
 * Returns the absolute paths of any files rewritten. Throws a plain `Error`
 * if an alias resolves to a file outside the copied catalog/templates/
 * output.map.ts/audit.ts, or to nothing at all.
 */
export function rewriteAdapterAliases(destRoot: string, pkgPath: string): string[] {
  const tsPaths = loadAdapterTsPaths(pkgPath);
  if (!tsPaths) return [];

  const copiedRoots = [
    join(destRoot, "catalog"),
    join(destRoot, "templates"),
    join(destRoot, "output.map.ts"),
    join(destRoot, "audit.ts"),
  ];

  const filesToScan: string[] = [];
  for (const root of copiedRoots) {
    if (!existsSync(root)) continue;
    if (statSync(root).isFile()) {
      if (root.endsWith(".ts")) filesToScan.push(root);
    } else {
      collectTsFiles(root, filesToScan);
    }
  }

  const rewritten: string[] = [];
  for (const file of filesToScan) {
    const source = readFileSync(file, "utf8");
    const { text, changed } = rewriteSpecifiers(source, (specifier) => {
      const match = matchAlias(specifier, tsPaths.paths);
      if (!match) return null;

      const resolved = resolveAliasTarget(tsPaths.baseUrl, match.targets, match.capture);
      if (!resolved) {
        throw new Error(
          `adapter alias "${specifier}" (tsconfig pattern "${match.pattern}") did not resolve ` +
            `to any file under ${tsPaths.baseUrl}`,
        );
      }

      const relToPkg = relative(pkgPath, resolved);
      const firstSeg = relToPkg.split(sep)[0];
      const isValidFile = VALID_TARGET_FILES.has(relToPkg);
      if (relToPkg.startsWith("..") || (!isValidFile && !VALID_TARGET_ROOTS.has(firstSeg ?? ""))) {
        throw new Error(
          `adapter alias "${specifier}" resolves to "${relToPkg || resolved}", outside ` +
            `catalog/templates/output.map.ts/audit.ts — composer's self-contained copy only ` +
            `supports adapter-internal aliases whose targets live inside those copied trees`,
        );
      }

      const targetInDest = join(destRoot, relToPkg);
      const rel = relative(dirname(file), targetInDest).split(sep).join("/");
      const withJsExt = rel.replace(/\.tsx?$/, ".js");
      return withJsExt.startsWith(".") ? withJsExt : `./${withJsExt}`;
    });

    if (changed) {
      writeFileSync(file, text, "utf8");
      rewritten.push(file);
    }
  }

  return rewritten;
}
