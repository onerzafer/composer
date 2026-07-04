// T011 — Catalog loader using `tsx` programmatic API.
//
// FR-023: `<workspace>/catalog/ingested/` is engine-ignored. The loader follows
// imports starting from `<catalogDir>/index.ts` only; `ingested/` is structurally
// invisible because nothing imports from it. This is by design — no explicit skip
// is needed because the loader never lists directory contents.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

export interface LoadedCatalog {
  /** Absolute path to design/catalog/ */
  catalogDir: string;
  /** Imported module from catalog/index.ts */
  module: Record<string, unknown>;
  /** Content hash of the catalog's source files (see `hashCatalogSources`). */
  contentHash: string;
}

/**
 * Recursively collect catalog source files (`.ts`, excluding `.d.ts`) under
 * `dir`. Skips any directory literally named `ingested` — FR-023 keeps
 * quarantined drafts structurally invisible to the loader, so they must not
 * affect the cache key either.
 */
function collectCatalogSourceFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "ingested") continue;
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      collectCatalogSourceFiles(abs, out);
    } else if (stat.isFile() && entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(abs);
    }
  }
}

/**
 * Content hash of every catalog source file (`.ts`, sans `.d.ts`) under
 * `catalogDir`. Used to key the process-local compiled-catalog cache:
 * identical content → identical hash → cache hit, regardless of which
 * directory (tempdir, workspace, materialized parent cache) it was loaded
 * from. Any edit, add, or remove of a catalog source file changes the hash
 * and invalidates the cache.
 */
export function hashCatalogSources(catalogDir: string): string {
  const files: string[] = [];
  collectCatalogSourceFiles(catalogDir, files);
  files.sort((a, b) => relative(catalogDir, a).localeCompare(relative(catalogDir, b)));

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(catalogDir, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * Process-local cache of imported catalog modules, keyed by content hash
 * (see `hashCatalogSources`). Repeated composes against an unchanged catalog
 * — tests, batch operations, a long-lived MCP session — skip `tsx`'s ~30s
 * cold transpile entirely on every hit after the first. As a side effect this
 * also avoids re-invoking `tsImport` against the same module graph, which is
 * what triggers the tsx loader-cache deadlock described in orchestrator.ts
 * (the T077 3rd-compose hang).
 */
const CATALOG_MODULE_CACHE = new Map<string, Record<string, unknown>>();

/**
 * Load a catalog by importing its `index.ts` via tsx (no pre-build required).
 * Throws if the index file is missing. Cached in-process by content hash of
 * the catalog's source files — see `CATALOG_MODULE_CACHE`.
 */
export async function loadCatalog(catalogDir: string): Promise<LoadedCatalog> {
  const absCatalogDir = resolve(catalogDir);
  if (!existsSync(absCatalogDir) || !statSync(absCatalogDir).isDirectory()) {
    throw new Error(`Catalog directory not found: ${absCatalogDir}`);
  }
  const indexPath = join(absCatalogDir, "index.ts");
  if (!existsSync(indexPath)) {
    throw new Error(
      `Catalog index not found at ${indexPath}. Catalogs must export their ` +
        `discriminated union as \`PrimitiveNode\` from index.ts.`,
    );
  }

  const contentHash = hashCatalogSources(absCatalogDir);
  const cached = CATALOG_MODULE_CACHE.get(contentHash);
  if (cached) {
    return { catalogDir: absCatalogDir, module: cached, contentHash };
  }

  // tsImport resolves relative to a base URL.
  const baseUrl = pathToFileURL(absCatalogDir + "/").href;
  const module = (await tsImport(indexPath, baseUrl)) as Record<string, unknown>;
  CATALOG_MODULE_CACHE.set(contentHash, module);

  return { catalogDir: absCatalogDir, module, contentHash };
}

/** Test-only escape hatch: clears the process-local catalog module cache. */
export function _resetCatalogCacheForTests(): void {
  CATALOG_MODULE_CACHE.clear();
}
