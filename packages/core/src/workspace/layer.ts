// T024 — Workspace layering: build the effective workspace view by inspecting
// the on-disk content (and, in US3, by merging a parent adapter's content on top).
//
// v0.1 Foundational scope (this file): project-only workspace. Parent-adapter
// layering for `extends:` is implemented in US3 (T077) — the data structures
// here already accommodate it via the `templatePaths`/`prepPaths` maps.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface EffectiveWorkspace {
  /** Absolute workspace root. */
  root: string;
  /** Map of template filename → absolute path. Project overrides parent by filename. */
  templatePaths: Map<string, string>;
  /** Map of prep filename → absolute path. */
  prepPaths: Map<string, string>;
  /** Absolute path to the catalog index (catalog/index.ts). */
  catalogIndexPath: string;
  /** Absolute path to output.map.ts. */
  outputMapPath: string;
  /** Absolute path to audit.ts (optional). */
  auditPath: string | null;
  /** Parsed design tokens (empty object if tokens.json missing). */
  tokens: Record<string, unknown>;
  /** Markdown content of guidelines.md (empty string if missing). */
  guidelines: string;
}

/**
 * Build the effective workspace view from on-disk content.
 * In v0.1 this handles a project-only workspace; parent layering arrives in US3.
 */
export function layerWorkspace(workspaceRoot: string): EffectiveWorkspace {
  const catalogDir = join(workspaceRoot, "catalog");
  const catalogIndexPath = join(catalogDir, "index.ts");
  if (!existsSync(catalogIndexPath)) {
    throw new Error(
      `Workspace is missing catalog index: ${catalogIndexPath}. Each workspace ` +
        `must export a discriminated-union catalog from catalog/index.ts.`,
    );
  }

  const templatePaths = collectTemplates(join(workspaceRoot, "templates"));
  const prepPaths = collectPreps(join(workspaceRoot, "templates"));

  const outputMapPath = join(workspaceRoot, "output.map.ts");
  if (!existsSync(outputMapPath)) {
    throw new Error(
      `Workspace is missing output map: ${outputMapPath}. Each workspace must ` +
        `export an output-path resolver from output.map.ts.`,
    );
  }

  const auditCandidate = join(workspaceRoot, "audit.ts");
  const auditPath = existsSync(auditCandidate) ? auditCandidate : null;

  const tokens = loadTokens(workspaceRoot);
  const guidelines = loadGuidelines(workspaceRoot);

  return {
    root: workspaceRoot,
    templatePaths,
    prepPaths,
    catalogIndexPath,
    outputMapPath,
    auditPath,
    tokens,
    guidelines,
  };
}

function collectTemplates(templatesDir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(templatesDir)) return out;
  for (const entry of readdirSync(templatesDir)) {
    const abs = join(templatesDir, entry);
    if (statSync(abs).isFile() && entry.endsWith(".hbs")) {
      out.set(entry, abs);
    }
  }
  return out;
}

function collectPreps(templatesDir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(templatesDir)) return out;
  for (const entry of readdirSync(templatesDir)) {
    const abs = join(templatesDir, entry);
    if (statSync(abs).isFile() && entry.endsWith(".prep.ts")) {
      out.set(entry, abs);
    }
  }
  return out;
}

function loadTokens(root: string): Record<string, unknown> {
  const path = join(root, "tokens.json");
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function loadGuidelines(root: string): string {
  const path = join(root, "guidelines.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}
