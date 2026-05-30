// T009 — `composer ingest <plugin> <source>` (003 US1).
//
// Resolves a `@composer/ingest-<plugin>` package, runs it against a source
// path, and writes the resulting CandidateDrafts into the workspace
// quarantine (`<workspace>/catalog/ingested/`). The engine ignores that
// directory until a human runs `composer promote`.

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { writeDraft, type IngesterPlugin } from "@composer/ingest-kit";

export interface IngestCliOptions {
  /** Project root containing `composer.json`. */
  projectRoot: string;
  /** Plugin id, e.g. `"react"` → resolves `@composer/ingest-react`. */
  plugin: string;
  /** Source path (file) to ingest. Relative paths resolve from `projectRoot`. */
  source: string;
}

export interface IngestCliResult {
  ok: true;
  drafts: Array<{
    name: string;
    schemaPath: string;
    templatePath: string;
  }>;
  elapsedMs: number;
}

export class IngestCliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "IngestCliError";
    this.exitCode = exitCode;
  }
}

// Plugin id allow-list — gates the package-name interpolation below.
const PLUGIN_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

export async function ingestCommand(
  options: IngestCliOptions,
): Promise<IngestCliResult> {
  const start = Date.now();

  if (!PLUGIN_PATTERN.test(options.plugin)) {
    throw new IngestCliError(
      `ingest: invalid plugin name ${JSON.stringify(options.plugin)}`,
      2,
    );
  }

  const projectRoot = resolve(options.projectRoot);
  const sourceAbs = resolve(projectRoot, options.source);
  if (!existsSync(sourceAbs)) {
    throw new IngestCliError(`ingest: source not found: ${sourceAbs}`, 6);
  }

  const composerJsonPath = join(projectRoot, "composer.json");
  if (!existsSync(composerJsonPath)) {
    throw new IngestCliError(
      `ingest: no composer.json at ${composerJsonPath}`,
      6,
    );
  }
  const composerJson = JSON.parse(readFileSync(composerJsonPath, "utf8")) as {
    workspace?: string;
  };
  const workspaceRel = composerJson.workspace ?? "./design";
  const workspaceRoot = join(
    projectRoot,
    workspaceRel.startsWith("./") ? workspaceRel.slice(2) : workspaceRel,
  );
  const quarantineDir = join(workspaceRoot, "catalog", "ingested");

  const pluginPkg = `@composer/ingest-${options.plugin}`;
  const require_ = createRequire(composerJsonPath);
  let pluginEntry: string;
  try {
    pluginEntry = require_.resolve(pluginPkg);
  } catch (err) {
    throw new IngestCliError(
      `ingest: could not resolve plugin ${pluginPkg}: ${(err as Error).message}`,
      2,
    );
  }
  const mod = (await import(pathToFileURL(pluginEntry).href)) as {
    default?: IngesterPlugin;
    [key: string]: unknown;
  };
  const plugin = pickIngesterPlugin(mod, options.plugin);
  if (!plugin) {
    throw new IngestCliError(
      `ingest: ${pluginPkg} does not export an IngesterPlugin (default export, or a named export with .name === ${JSON.stringify(options.plugin)})`,
      2,
    );
  }

  const drafts = await plugin.ingest(sourceAbs, { projectRoot, quarantineDir });
  const written = drafts.map((d) => {
    const out = writeDraft(d, quarantineDir);
    return { name: d.name, schemaPath: out.schemaPath, templatePath: out.templatePath };
  });

  return { ok: true, drafts: written, elapsedMs: Date.now() - start };
}

function pickIngesterPlugin(
  mod: { default?: IngesterPlugin; [key: string]: unknown },
  pluginName: string,
): IngesterPlugin | undefined {
  if (isIngester(mod.default) && mod.default.name === pluginName) return mod.default;
  for (const value of Object.values(mod)) {
    if (isIngester(value) && value.name === pluginName) return value;
  }
  // Final fallback: a default export whose .name is missing/different but the
  // shape matches — useful while plugin authors are still settling on naming.
  if (isIngester(mod.default)) return mod.default;
  return undefined;
}

function isIngester(value: unknown): value is IngesterPlugin {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as IngesterPlugin).name === "string" &&
    typeof (value as IngesterPlugin).ingest === "function"
  );
}
