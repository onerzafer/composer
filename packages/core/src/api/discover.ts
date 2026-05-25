// T040 — `discover()` endpoint (FR-001, SC-009).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { compileCatalog, loadCatalog } from "@composer/typescript";
import { resolveWorkspace } from "../workspace/resolve.js";
import { layerWorkspace } from "../workspace/layer.js";
import { ENGINE_VERSION } from "../version.js";

export interface DiscoverPrimitive {
  name: string;
  intent: string;
  whenToUse: string;
}

export interface DiscoverSpec {
  id: string;
  summary: string;
  updated: string;
}

export interface DiscoverResult {
  project: {
    name: string;
    engine: string;
    adapter: string | null;
    version: string;
  };
  primitives: DiscoverPrimitive[];
  specs: DiscoverSpec[];
  guidelines: string;
  tokens: Record<string, unknown> | null;
  catalog_version: string;
  suggested_next: "scaffold";
}

export async function discover(projectRoot: string): Promise<DiscoverResult> {
  const resolved = resolveWorkspace(projectRoot);
  const workspace = layerWorkspace(resolved.workspaceRoot);
  const loaded = await loadCatalog(join(workspace.root, "catalog"));
  const catalog = compileCatalog(loaded);

  const primitives: DiscoverPrimitive[] = [];
  for (const name of catalog.primitives.keys()) {
    const meta = catalog.meta.get(name);
    primitives.push({
      name,
      intent: meta?.intent ?? "",
      whenToUse: meta?.whenToUse ?? "",
    });
  }

  return {
    project: {
      name: extractProjectName(resolved.projectRoot),
      engine: resolved.config.engine,
      adapter: resolved.config.extends ?? null,
      version: ENGINE_VERSION,
    },
    primitives,
    specs: listSpecs(workspace.root),
    guidelines: workspace.guidelines,
    tokens: Object.keys(workspace.tokens).length > 0 ? workspace.tokens : null,
    catalog_version: catalog.catalogVersion,
    suggested_next: "scaffold",
  };
}

function listSpecs(workspaceRoot: string): DiscoverSpec[] {
  const specsDir = join(workspaceRoot, "specs");
  if (!existsSync(specsDir)) return [];
  const out: DiscoverSpec[] = [];
  for (const entry of readdirSync(specsDir)) {
    if (!entry.endsWith(".json")) continue;
    const abs = join(specsDir, entry);
    const id = entry.replace(/\.json$/, "");
    const stat = statSync(abs);
    let summary = id;
    try {
      const parsed = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
      const meta = parsed["metadata"] as Record<string, unknown> | undefined;
      const title = meta?.["title"];
      if (typeof title === "string") summary = title;
      else if (typeof parsed["primitive"] === "string") summary = `${parsed["primitive"]} ${id}`;
    } catch {
      /* ignore */
    }
    out.push({ id, summary, updated: stat.mtime.toISOString() });
  }
  return out;
}

function extractProjectName(projectRoot: string): string {
  const pkgPath = join(projectRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
      if (typeof pkg.name === "string" && pkg.name.length > 0) return pkg.name;
    } catch {
      /* ignore */
    }
  }
  return basename(projectRoot);
}
