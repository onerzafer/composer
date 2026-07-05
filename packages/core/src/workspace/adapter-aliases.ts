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
// `src/` is a valid rewrite target alongside catalog/templates/
// output.map.ts/audit.ts because `resolveAndCacheParent` also materializes
// a parent's `src/` tree (see workspace/extends.ts) — an adapter like
// @sifir/design-system commonly pulls its own catalog's primitive schemas
// in via an alias resolving there (e.g. `@/registry/*`). An alias whose
// resolved target falls outside all of those copied roots is still out of
// scope — the adapter would need that file copied too, which this engine
// has no way to know is safe/intended — so that case raises a clear,
// descriptive error instead of silently emitting a broken import that
// would only fail later at compose time with a much more confusing
// message.
// Similarly, `paths` declared in a config the adapter's tsconfig `extends`
// (rather than in the file itself) are not read — adapters are expected to
// declare their own aliases directly, matching the copy-time contract above.
//
// An alias that matches a `paths` pattern but resolves to NO file at all
// (not even outside the copied roots) is left untouched rather than
// erroring — see `rewriteAdapterAliases`'s own header for why: some of a
// real adapter's own files (@sifir/design-system's `src/**` component
// layer, `templates/prep/complexity-config.ts`) deliberately reference an
// alias only a CONSUMING SITE resolves at its own build time (its own
// generated `src/config/*`), and this engine's scan runs over the whole
// copied tree regardless of whether a given file is ever actually loaded.

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
 * relative path rather than a directory segment. `src` is included because
 * `resolveAndCacheParent` materializes a parent's `src/` tree alongside
 * `catalog/`/`templates/` (see workspace/extends.ts's `PARENT_COPIES`) —
 * an adapter like `@sifir/design-system` that pulls its own primitive
 * schemas into `catalog/index.ts` via an alias resolving into `src/`
 * (e.g. `@/registry/*`) is just as self-contained post-copy as one whose
 * alias resolves inside `catalog/` itself. */
const VALID_TARGET_ROOTS = new Set(["catalog", "templates", "src"]);
const VALID_TARGET_FILES = new Set(["output.map.ts", "audit.ts"]);

/**
 * Read `compilerOptions.baseUrl` + `paths` directly from `<pkgPath>/tsconfig.json`.
 * Returns null when the adapter has no tsconfig.json, it fails to parse, or it
 * declares no `paths` — all "nothing to do" cases, not errors.
 *
 * Strips whole-line `//` comments before parsing: a real adapter's
 * tsconfig.json is JSONC, not strict JSON — `@sifir/design-system`'s own
 * ships one (documenting its `exclude` list), and a plain `JSON.parse`
 * against it throws a `SyntaxError` that this function's own "failed to
 * parse" contract then silently swallows into "no paths declared", which
 * skips every rewrite below without a single error — a real adapter's
 * aliases just quietly stay broken. Same whole-line-only convention (a
 * line whose TRIMMED content starts with `//`) as that adapter's own
 * `register.mjs` already uses for the identical reason; deliberately not a
 * general JSONC parser (no trailing-comma handling, no inline `//`).
 */
function loadAdapterTsPaths(pkgPath: string): AdapterTsPaths | null {
  const tsconfigPath = join(pkgPath, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return null;

  const raw = readFileSync(tsconfigPath, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
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
 * catalog/templates/output.map.ts/audit.ts/src under `destRoot`, so the copy
 * is fully self-contained. `pkgPath` is the adapter package's own installed
 * root (used to read its tsconfig.json and to resolve alias targets against
 * it) — for `init --extends` this is the same package the copy was taken
 * from; for `extends:` parent-layering this is the original
 * `node_modules/<adapter>` install root, while `destRoot` is the
 * `.composer/cache/parent/<safeName>/` materialization (see extends.ts).
 *
 * `src` is scanned alongside catalog/templates/output.map.ts/audit.ts (not
 * just accepted as a valid alias TARGET — see `VALID_TARGET_ROOTS`) because
 * a real adapter's `src/` tree commonly uses the SAME alias internally,
 * self-referentially: `@sifir/design-system`'s `src/catalog/atoms.ts`
 * imports `@/core/icons/icons-generated`, its own package-wide `@/*` alias,
 * the same way `catalog/index.ts` does. Since `src/` is copied alongside
 * `catalog/` (extends.ts's `PARENT_COPIES`), those self-referencing aliases
 * need the identical rewrite treatment, or the copy is only self-contained
 * for the FIRST hop (catalog/audit.ts's own imports) and still breaks the
 * moment loading a spec's catalog transitively pulls in one of src/'s own
 * alias-using files.
 *
 * Returns the absolute paths of any files rewritten. Throws a plain `Error`
 * if an alias resolves to a REAL file outside the copied catalog/templates/
 * output.map.ts/audit.ts/src — an alias that doesn't resolve to any file at
 * all is left untouched instead (see the `resolveAliasTarget` call site's
 * own comment for why: an eager whole-tree scan runs over files a compose
 * may never actually load).
 */
export function rewriteAdapterAliases(destRoot: string, pkgPath: string): string[] {
  const tsPaths = loadAdapterTsPaths(pkgPath);
  if (!tsPaths) return [];

  const copiedRoots = [
    join(destRoot, "catalog"),
    join(destRoot, "templates"),
    join(destRoot, "output.map.ts"),
    join(destRoot, "audit.ts"),
    join(destRoot, "src"),
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
        // Left untouched, not thrown: scanning the whole copied `src/` tree
        // (not just catalog/templates/output.map.ts/audit.ts's own direct
        // imports) means this runs over files that are never actually
        // `tsImport`ed by a compose at all — @sifir/design-system's own
        // src/components/**/types.ts and templates/prep/complexity-config.ts
        // reference `@/config/complexity`, a module that ONLY ever exists in
        // a CONSUMING SITE's own generated `src/config/complexity.ts`
        // (deriveWorkspaceConfig's output — see that adapter's own ambient
        // `complexity.d.ts` shims documenting exactly this), never inside the
        // adapter package itself, by design. Throwing here would fail
        // resolveAndCacheParent for every such adapter even though nothing
        // ever actually executes these specifiers through OUR copy — if a
        // file that genuinely needs this specifier at runtime IS loaded,
        // Node's own `Cannot find package` error surfaces there instead,
        // same failure, just correctly deferred to actual use.
        return null;
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
