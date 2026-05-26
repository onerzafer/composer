// T024 / T077 — Workspace layering: build the effective workspace view by
// inspecting on-disk content and, when an `extends:` parent is configured,
// layering parent content underneath.
//
// Layering rules (US3 Acceptance #1 + #3):
//   - templates/<name>.hbs   — parent contributes; project overrides by filename
//   - templates/<name>.prep.ts — same rule
//   - catalog/index.ts       — project wins entirely if present; parent's used
//                              as fallback when project has no catalog
//   - output.map.ts          — project wins entirely if present; parent's else
//   - audit.ts               — parent + project both retained; phase chains
//                              parent-before-project (audit.ts caller decides)
//
// Primitive-shadow warnings (US3 Acceptance #2) are emitted by `composer doctor`
// using `parentPrimitiveNames` exposed below; the compose pipeline does not
// merge discriminated unions at runtime in v0.1.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedParent } from "./extends.js";

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
  /** Absolute path to project's audit.ts (optional). */
  auditPath: string | null;
  /** Absolute path to parent's audit (.js cached form) when extends is set. */
  parentAuditPath: string | null;
  /** Parsed design tokens (empty object if tokens.json missing). */
  tokens: Record<string, unknown>;
  /** Markdown content of guidelines.md (empty string if missing). */
  guidelines: string;
  /** Provenance for each template filename — used by `composer doctor` to flag overrides. */
  templateOrigin: Map<string, "project" | "parent">;
  /** Parent metadata when `extends:` is set; null for self-contained projects. */
  parent: ResolvedParent | null;
}

/**
 * Build the effective workspace view from on-disk content. Pass the materialized
 * parent (from `resolveAndCacheParent`) for `extends:`-style layering.
 */
export function layerWorkspace(
  workspaceRoot: string,
  parent: ResolvedParent | null = null,
): EffectiveWorkspace {
  const projectCatalogIndex = join(workspaceRoot, "catalog", "index.ts");
  const projectOutputMap = join(workspaceRoot, "output.map.ts");

  // Catalog: project wins if present; else fall back to parent's.
  let catalogIndexPath: string;
  if (existsSync(projectCatalogIndex)) {
    catalogIndexPath = projectCatalogIndex;
  } else if (parent && parent.hasCatalog) {
    catalogIndexPath = join(parent.cacheRoot, "catalog", "index.ts");
  } else {
    throw new Error(
      `Workspace is missing catalog index: ${projectCatalogIndex}. Either supply ` +
        `\`catalog/index.ts\` in the workspace or set \`extends:\` to an adapter ` +
        `that ships one.`,
    );
  }

  // Output map: same rule.
  let outputMapPath: string;
  if (existsSync(projectOutputMap)) {
    outputMapPath = projectOutputMap;
  } else if (parent && parent.hasOutputMap) {
    const parentTs = join(parent.cacheRoot, "output.map.ts");
    const parentJs = join(parent.cacheRoot, "output.map.js");
    outputMapPath = existsSync(parentTs) ? parentTs : parentJs;
  } else {
    throw new Error(
      `Workspace is missing output map: ${projectOutputMap}. Either supply ` +
        `\`output.map.ts\` in the workspace or set \`extends:\` to an adapter ` +
        `that ships one.`,
    );
  }

  // Template/prep layering: parent first, project entries shadow by filename.
  const templatePaths = new Map<string, string>();
  const prepPaths = new Map<string, string>();
  const templateOrigin = new Map<string, "project" | "parent">();
  if (parent && parent.hasTemplates) {
    collectTemplates(join(parent.cacheRoot, "templates"), templatePaths, templateOrigin, "parent");
    collectPreps(join(parent.cacheRoot, "templates"), prepPaths);
  }
  collectTemplates(join(workspaceRoot, "templates"), templatePaths, templateOrigin, "project");
  collectPreps(join(workspaceRoot, "templates"), prepPaths);

  const auditCandidate = join(workspaceRoot, "audit.ts");
  const auditPath = existsSync(auditCandidate) ? auditCandidate : null;

  // Parent audit (cached as .js when shipped, else .ts). Prefer .js so the
  // loader uses native `import()` instead of tsx (faster and avoids the
  // deadlock surfaced wiring T077 when the same audit is loaded repeatedly).
  let parentAuditPath: string | null = null;
  if (parent && parent.hasAudit) {
    const js = join(parent.cacheRoot, "audit.js");
    const ts = join(parent.cacheRoot, "audit.ts");
    parentAuditPath = existsSync(js) ? js : existsSync(ts) ? ts : null;
  }

  const tokens = loadTokens(workspaceRoot);
  const guidelines = loadGuidelines(workspaceRoot);

  return {
    root: workspaceRoot,
    templatePaths,
    prepPaths,
    catalogIndexPath,
    outputMapPath,
    auditPath,
    parentAuditPath,
    tokens,
    guidelines,
    templateOrigin,
    parent,
  };
}

function collectTemplates(
  templatesDir: string,
  into: Map<string, string>,
  origin: Map<string, "project" | "parent">,
  source: "project" | "parent",
): void {
  if (!existsSync(templatesDir)) return;
  for (const entry of readdirSync(templatesDir)) {
    const abs = join(templatesDir, entry);
    if (statSync(abs).isFile() && entry.endsWith(".hbs")) {
      into.set(entry, abs);
      origin.set(entry, source);
    }
  }
}

function collectPreps(templatesDir: string, into: Map<string, string>): void {
  if (!existsSync(templatesDir)) return;
  for (const entry of readdirSync(templatesDir)) {
    const abs = join(templatesDir, entry);
    if (statSync(abs).isFile() && entry.endsWith(".prep.ts")) {
      into.set(entry, abs);
    }
  }
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
