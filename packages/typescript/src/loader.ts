// T011 — Catalog loader using `tsx` programmatic API.
//
// FR-023: `<workspace>/catalog/ingested/` is engine-ignored. The loader follows
// imports starting from `<catalogDir>/index.ts` only; `ingested/` is structurally
// invisible because nothing imports from it. This is by design — no explicit skip
// is needed because the loader never lists directory contents.

import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

export interface LoadedCatalog {
  /** Absolute path to design/catalog/ */
  catalogDir: string;
  /** Imported module from catalog/index.ts */
  module: Record<string, unknown>;
}

/**
 * Load a catalog by importing its `index.ts` via tsx (no pre-build required).
 * Throws if the index file is missing.
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

  // tsImport resolves relative to a base URL.
  const baseUrl = pathToFileURL(absCatalogDir + "/").href;
  const module = (await tsImport(indexPath, baseUrl)) as Record<string, unknown>;

  return { catalogDir: absCatalogDir, module };
}
