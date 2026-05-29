// T071/T072 — `composer init` command (US2 Acceptance #1–#3).
//
// Two modes:
//   --extends <pkg>   Adopt a published adapter. Resolves it via Node's resolver
//                     (already-installed) or shells out to `npm install <pkg>`.
//                     Copies the adapter's catalog/templates/output.map into the
//                     workspace so v0.1 (which has no parent-layering yet — see
//                     T077/v0.2) ships self-contained. The `extends:` field is
//                     still written for forward-compat with US3.
//   --bare            Self-authored minimal workspace — one stub primitive,
//                     template, and output.map.
//
// Behavior shared by both modes:
//   1. Refuse if composer.json exists at projectRoot (InitError exitCode=1).
//   2. Create the workspace skeleton (catalog/ + templates/ + specs/).
//   3. Write composer.json.
//   4. Append .composer/{cache,logs,staging}/ to .gitignore.
//   5. Run one sample compose to prove the loop works (US2 Acceptance #1).
//
// Returns elapsedMs (engine-side) so callers can assert SC-002 (≤30s).

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compose } from "@composer/core";

export class InitError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "InitError";
  }
}

export interface InitOptions {
  projectRoot: string;
  /** Adapter package name (with or without `@<major>`); mutually exclusive with `bare`. */
  extends?: string;
  /** Bare mode — no adapter; mutually exclusive with `extends`. */
  bare?: boolean;
  /** Workspace folder name. Default: `./design`. */
  workspace?: string;
}

export interface InitResult {
  ok: true;
  projectRoot: string;
  composerJson: string;
  filesWritten: string[];
  sampleSpec: string | null;
  sampleOutput: string | null;
  elapsedMs: number;
}

const DEFAULT_WORKSPACE = "./design";

const GITIGNORE_ENTRIES = [
  "# Added by composer init",
  ".composer/cache/",
  ".composer/logs/",
  ".composer/staging/",
];

// Permits npm-style package specs (with optional scope) + an optional version
// pin of the form `@<digits>` or `@<semver-ish>`. Used to gate any spec value
// before it reaches `npm install` to defend against command-injection.
const PKG_SPEC_PATTERN =
  /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(@[a-z0-9.~^>=<_-]+)?$/i;

const BARE_CATALOG_INDEX = `import { z } from "zod";

export const Hero = z.object({
  primitive: z.literal("Hero"),
  id: z.string(),
  title: z.string().min(1),
}).strict();

export const HeroMeta = {
  primitive: "Hero",
  version: "1.0.0",
  intent: "Top-of-page focal block.",
  whenToUse: "Page hero anchoring the section.",
  whenNotToUse: [],
  fieldGuidance: { title: "1-line action-oriented" },
  examples: [{ primitive: "Hero", id: "demo", title: "Hello world" }],
} as const;

export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero]);
`;

const BARE_HERO_TEMPLATE = `// from: spec={{spec_path}} primitive=Hero id={{id}}
export const hero_{{id}} = { title: {{{json title}}} };
`;

const BARE_OUTPUT_MAP = `export default {
  byPrimitive: {
    Hero: (node) => [{ path: "src/heroes/" + node.id + ".ts", language: "ts" }],
  },
};
`;

const BARE_STARTER_SPEC = {
  primitive: "Hero",
  id: "welcome",
  title: "Welcome to Composer",
};

export async function init(options: InitOptions): Promise<InitResult> {
  const start = Date.now();

  if (!options.projectRoot) {
    throw new InitError("init() requires projectRoot", 1);
  }
  if (!options.extends && !options.bare) {
    throw new InitError("init() requires either --extends <pkg> or --bare", 1);
  }
  if (options.extends && options.bare) {
    throw new InitError("init() flags --extends and --bare are mutually exclusive", 1);
  }

  const projectRoot = resolve(options.projectRoot);
  const composerJsonPath = join(projectRoot, "composer.json");

  // T072 — refuse overwrite.
  if (existsSync(composerJsonPath)) {
    throw new InitError(
      `composer.json already exists at ${composerJsonPath}. ` +
        `Remove it first or run init in a different directory.`,
      1,
    );
  }

  const workspaceRel = options.workspace ?? DEFAULT_WORKSPACE;
  const workspaceRoot = join(projectRoot, normalizeWorkspaceRel(workspaceRel));

  const filesWritten: string[] = [];

  mkdirSync(join(workspaceRoot, "catalog"), { recursive: true });
  mkdirSync(join(workspaceRoot, "templates"), { recursive: true });
  mkdirSync(join(workspaceRoot, "specs"), { recursive: true });

  // Author the workspace as ESM regardless of the host project's module system.
  // In a CommonJS host (no "type":"module"), tsx transpiles the workspace's
  // output.map.ts to CJS and Node's interop double-wraps its default export,
  // breaking compose. A workspace-local package.json keeps these modules ESM.
  const workspacePkgPath = join(workspaceRoot, "package.json");
  if (!existsSync(workspacePkgPath)) {
    writeFileSync(workspacePkgPath, JSON.stringify({ type: "module" }, null, 2) + "\n", "utf8");
    filesWritten.push(workspaceRelPath(projectRoot, workspaceRoot, "package.json"));
  }

  let extendsField: string | undefined;
  let sampleSpecId: string | null = null;

  if (options.bare) {
    writeFileSync(join(workspaceRoot, "catalog", "index.ts"), BARE_CATALOG_INDEX, "utf8");
    filesWritten.push(workspaceRelPath(projectRoot, workspaceRoot, "catalog/index.ts"));

    writeFileSync(join(workspaceRoot, "templates", "hero.ts.hbs"), BARE_HERO_TEMPLATE, "utf8");
    filesWritten.push(workspaceRelPath(projectRoot, workspaceRoot, "templates/hero.ts.hbs"));

    writeFileSync(join(workspaceRoot, "output.map.ts"), BARE_OUTPUT_MAP, "utf8");
    filesWritten.push(workspaceRelPath(projectRoot, workspaceRoot, "output.map.ts"));

    sampleSpecId = "welcome";
    writeFileSync(
      join(workspaceRoot, "specs", `${sampleSpecId}.json`),
      JSON.stringify(BARE_STARTER_SPEC, null, 2) + "\n",
      "utf8",
    );
    filesWritten.push(workspaceRelPath(projectRoot, workspaceRoot, `specs/${sampleSpecId}.json`));
  } else {
    const adapterSpec = options.extends!;
    if (!PKG_SPEC_PATTERN.test(adapterSpec)) {
      throw new InitError(
        `--extends ${adapterSpec} is not a valid npm package spec`,
        2,
      );
    }
    const { pkgName, pkgPath, version } = resolveAdapter(projectRoot, adapterSpec);
    const major = version.split(".")[0] ?? "1";
    extendsField = `${pkgName}@${major}`;

    // Copy adapter content into workspace (catalog, templates, output.map.ts).
    // This is v0.1's stand-in for parent-layering (US3/T077 will swap in real
    // extends resolution; project-local copies then shadow parent per spec).
    cpSync(join(pkgPath, "catalog"), join(workspaceRoot, "catalog"), { recursive: true });
    cpSync(join(pkgPath, "templates"), join(workspaceRoot, "templates"), { recursive: true });
    cpSync(join(pkgPath, "output.map.ts"), join(workspaceRoot, "output.map.ts"));
    filesWritten.push(workspaceRelPath(projectRoot, workspaceRoot, "catalog/"));
    filesWritten.push(workspaceRelPath(projectRoot, workspaceRoot, "templates/"));
    filesWritten.push(workspaceRelPath(projectRoot, workspaceRoot, "output.map.ts"));

    // Cache parent reference for v0.2 freshness checks (R15 / T099).
    const parentCacheDir = join(projectRoot, ".composer", "cache", "parent");
    mkdirSync(parentCacheDir, { recursive: true });
    writeFileSync(
      join(parentCacheDir, "manifest.json"),
      JSON.stringify(
        { name: pkgName, version, fetched_at: new Date().toISOString() },
        null,
        2,
      ),
      "utf8",
    );

    // Run the adapter's bootstrap to seed a starter spec.
    sampleSpecId = await runAdapterBootstrap(pkgPath, {
      projectRoot,
      workspaceRoot,
      composerJsonPath,
    });
  }

  // Write composer.json (after workspace exists so the file isn't dangling if
  // an earlier step blows up — though sample-compose can still fail; that's why
  // we run it AFTER composer.json is on disk).
  const composerJson: Record<string, unknown> = {
    workspace: workspaceRel,
    engine: "@composer/typescript@1",
  };
  if (extendsField) composerJson.extends = extendsField;
  writeFileSync(composerJsonPath, JSON.stringify(composerJson, null, 2) + "\n", "utf8");
  filesWritten.push("composer.json");

  // Append .gitignore entries.
  appendGitignore(projectRoot);
  filesWritten.push(".gitignore");

  // Run one sample compose to prove the loop works (US2 Acceptance #1).
  let sampleSpec: string | null = null;
  let sampleOutput: string | null = null;
  if (sampleSpecId) {
    const specRelPath = `${normalizeWorkspaceRel(workspaceRel)}/specs/${sampleSpecId}.json`;
    sampleSpec = specRelPath;
    const specJson = JSON.parse(
      readFileSync(join(projectRoot, specRelPath), "utf8"),
    ) as unknown;
    try {
      const result = await compose(projectRoot, sampleSpecId, specJson, { surface: "cli" });
      const firstOutput = result.files_written[0];
      if (firstOutput) sampleOutput = firstOutput.path;
    } catch (err) {
      throw new InitError(
        `Sample compose failed for spec "${sampleSpecId}": ${(err as Error).message}`,
        4,
      );
    }
  }

  return {
    ok: true,
    projectRoot,
    composerJson: composerJsonPath,
    filesWritten,
    sampleSpec,
    sampleOutput,
    elapsedMs: Date.now() - start,
  };
}

function normalizeWorkspaceRel(rel: string): string {
  return rel.startsWith("./") ? rel.slice(2) : rel;
}

function workspaceRelPath(projectRoot: string, workspaceRoot: string, rel: string): string {
  const abs = join(workspaceRoot, rel);
  return abs.startsWith(projectRoot)
    ? abs.slice(projectRoot.length + 1)
    : rel;
}

function appendGitignore(projectRoot: string): void {
  const gitignorePath = join(projectRoot, ".gitignore");
  let existing = "";
  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, "utf8");
    if (existing.includes(".composer/cache/")) return; // already wired
    if (!existing.endsWith("\n")) existing += "\n";
  }
  writeFileSync(gitignorePath, existing + GITIGNORE_ENTRIES.join("\n") + "\n", "utf8");
}

interface ResolvedAdapter {
  pkgName: string;
  pkgPath: string;
  version: string;
}

function resolveAdapter(projectRoot: string, spec: string): ResolvedAdapter {
  // Accept `@scope/name` or `@scope/name@1`. Strip any `@<major>` for resolution.
  const pkgName = stripVersionSuffix(spec);
  const require_ = createRequire(join(projectRoot, "package.json"));

  // First attempt — already installed?
  let pkgJsonPath: string;
  try {
    pkgJsonPath = require_.resolve(`${pkgName}/package.json`);
  } catch {
    // Fall back to `npm install <spec>`. Spec is gated by PKG_SPEC_PATTERN
    // upstream; using execFile with array args (not exec with a shell string)
    // is the second line of defense.
    try {
      execFileSync("npm", ["install", "--no-save", spec], {
        cwd: projectRoot,
        stdio: "ignore",
      });
    } catch (err) {
      throw new InitError(
        `npm install ${spec} failed: ${(err as Error).message}`,
        2,
      );
    }
    try {
      pkgJsonPath = require_.resolve(`${pkgName}/package.json`);
    } catch (err) {
      throw new InitError(
        `Could not resolve ${pkgName} after npm install: ${(err as Error).message}`,
        2,
      );
    }
  }

  const pkgPath = dirname(pkgJsonPath);
  const meta = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { version?: string };
  if (!meta.version) {
    throw new InitError(`Adapter ${pkgName} has no version in package.json`, 2);
  }
  return { pkgName, pkgPath, version: meta.version };
}

function stripVersionSuffix(spec: string): string {
  // For scoped packages, only the trailing `@N...` is the version pin.
  // `@composer/adapter-next@1` → `@composer/adapter-next`
  // `@composer/adapter-next`   → `@composer/adapter-next`
  // `cac@1`                    → `cac`
  const lastAt = spec.lastIndexOf("@");
  if (lastAt > 0 && /^[0-9^~<>=]/.test(spec.slice(lastAt + 1))) {
    return spec.slice(0, lastAt);
  }
  return spec;
}

interface AdapterBootstrapCtx {
  projectRoot: string;
  workspaceRoot: string;
  composerJsonPath: string;
}

async function runAdapterBootstrap(
  pkgPath: string,
  ctx: AdapterBootstrapCtx,
): Promise<string | null> {
  const bootstrapJs = join(pkgPath, "bootstrap.js");
  if (!existsSync(bootstrapJs)) return null;
  // Use a fileURL so Node's ESM loader accepts the absolute path on macOS/Linux.
  const mod = (await import(pathToFileURL(bootstrapJs).href)) as {
    bootstrap?: (ctx: AdapterBootstrapCtx) => Promise<void> | void;
    default?: (ctx: AdapterBootstrapCtx) => Promise<void> | void;
  };
  const fn = mod.bootstrap ?? mod.default;
  if (!fn) {
    throw new InitError(
      `Adapter at ${pkgPath} has bootstrap.js but no exported bootstrap function`,
      3,
    );
  }
  try {
    await fn(ctx);
  } catch (err) {
    throw new InitError(
      `Adapter bootstrap failed: ${(err as Error).message}`,
      3,
    );
  }
  return findFirstSpecId(join(ctx.workspaceRoot, "specs"));
}

function findFirstSpecId(specsDir: string): string | null {
  if (!existsSync(specsDir)) return null;
  const entries = readdirSync(specsDir).filter((f: string) => f.endsWith(".json"));
  if (entries.length === 0) return null;
  entries.sort();
  return entries[0]!.replace(/\.json$/, "");
}
