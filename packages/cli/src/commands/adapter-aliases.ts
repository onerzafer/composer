// T0XX — Resolve adapter-internal `@/*`-style tsconfig path aliases at
// `init --extends` copy time.
//
// Problem: an adapter package MAY organize its own catalog/templates/
// output.map.ts using a tsconfig `paths` alias (commonly `"@/*"`) declared in
// its OWN `tsconfig.json`, resolved by its own build/typecheck tooling.
// `init --extends` copies `catalog/`, `templates/`, and `output.map.ts`
// verbatim into the new workspace (v0.1's "self-contained copy" model — see
// init.ts's header comment) so it can run without parent-layering. That copy
// carries the bare alias specifier as-is, but nothing downstream understands
// it: TypeScript's `paths` is a type-checker-only convention that is never
// rewritten into emitted/loaded module specifiers, and the `tsx` programmatic
// API this engine loads catalog/output-map/audit modules with (`tsImport`,
// `tsx/esm/api`) does not apply tsconfig `paths` remapping either — confirmed
// empirically: passing `{ tsconfig: <path-to-a-tsconfig-declaring-paths> }`
// still fails to resolve a bare alias specifier. So a workspace copied from
// an alias-using adapter fails at compose time with Node's own bare-specifier
// error (`Cannot find package '@/core' imported from .../catalog/index.ts`)
// — previously "fixed" only by a human hand-authoring a tsconfig.json that
// re-declares the same paths, which does not actually address the runtime
// failure (tsc/IDEs would be happy; `compose` still isn't).
//
// Fix: since the copy already preserves each copied file's position relative
// to the adapter package root (`catalog/` copies to `catalog/`, `templates/`
// to `templates/`, `output.map.ts` to `output.map.ts`), the relative path
// between any two files that are BOTH inside that copied set is identical
// before and after the copy. So any adapter-declared alias whose target
// resolves inside catalog/templates/output.map.ts can be mechanically
// rewritten, post-copy, into an equivalent relative specifier — no runtime
// tsconfig discovery, no new module-loader hook, no new dependency, and no
// participation required from the (four separate) call sites that later
// `tsImport` these files. This keeps the fix inside v0.1's layering model:
// the project's copy is fully self-contained, including its imports.
//
// Scope: only bare specifiers matching a `paths` pattern declared in the
// adapter's own `<pkgPath>/tsconfig.json` are considered. Relative
// specifiers and real (node_modules) package specifiers are left untouched.
// An alias whose resolved target falls outside catalog/templates/
// output.map.ts is out of scope for v0.1's copy model — the adapter would
// need the file copied too, which this engine has no way to know is safe/
// intended — so that case raises a clear, descriptive error instead of
// silently emitting a broken import that would only fail later at compose
// time with a much more confusing message.
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
 * catalog/templates/output.map.ts under `workspaceRoot`, so the copy is fully
 * self-contained. `pkgPath` is the adapter package's own installed root (used
 * to read its tsconfig.json and to resolve alias targets against it).
 *
 * Returns the absolute paths of any files rewritten. Throws a plain `Error`
 * (the caller — init.ts — wraps it as an `InitError`) if an alias resolves
 * to a file outside the copied catalog/templates/output.map.ts, or to
 * nothing at all.
 */
export function rewriteAdapterAliases(workspaceRoot: string, pkgPath: string): string[] {
  const tsPaths = loadAdapterTsPaths(pkgPath);
  if (!tsPaths) return [];

  const copiedRoots = [
    join(workspaceRoot, "catalog"),
    join(workspaceRoot, "templates"),
    join(workspaceRoot, "output.map.ts"),
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
      const isOutputMap = relToPkg === "output.map.ts";
      if (relToPkg.startsWith("..") || (firstSeg !== "catalog" && firstSeg !== "templates" && !isOutputMap)) {
        throw new Error(
          `adapter alias "${specifier}" resolves to "${relToPkg || resolved}", outside ` +
            `catalog/templates/output.map.ts — composer's self-contained copy only supports ` +
            `adapter-internal aliases whose targets live inside those copied trees`,
        );
      }

      const targetInWorkspace = join(workspaceRoot, relToPkg);
      const rel = relative(dirname(file), targetInWorkspace).split(sep).join("/");
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
