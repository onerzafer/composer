// T012 — Compile a loaded catalog module into a runtime CompiledCatalog.

import type { z } from "zod";
import type { LoadedCatalog } from "./loader.js";
import type { PrimitiveMeta } from "@composer/adapter-kit";

export interface CompiledCatalog {
  /** Map of primitive discriminator literal → Zod schema. */
  primitives: Map<string, z.ZodTypeAny>;
  /** The discriminated union index — used for top-level structural parse. */
  index: z.ZodTypeAny;
  /** Per-primitive metadata (intent, whenToUse, …) keyed by name. */
  meta: Map<string, PrimitiveMeta>;
  /** Catalog version — max across primitive versions; "0.0.0" if none declared. */
  catalogVersion: string;
}

/**
 * Inspect a loaded catalog module and produce its runtime view.
 * Convention: catalog must export `PrimitiveNode` (the discriminated union),
 * and one `<Name>Meta` object per primitive (e.g., `HeroMeta`, `SectionMeta`).
 */
export function compileCatalog(loaded: LoadedCatalog): CompiledCatalog {
  const module = loaded.module;
  const indexUnion = module["PrimitiveNode"];
  if (!indexUnion || typeof indexUnion !== "object") {
    throw new Error(
      "Catalog index.ts must export `PrimitiveNode` (a `z.discriminatedUnion`).",
    );
  }

  const primitives = new Map<string, z.ZodTypeAny>();
  const meta = new Map<string, PrimitiveMeta>();

  // Walk the discriminated union via Zod's internal optionsMap.
  const optionsMap = (indexUnion as { _def?: { optionsMap?: Map<string, z.ZodTypeAny> } })._def
    ?.optionsMap;
  if (optionsMap instanceof Map) {
    for (const [name, schema] of optionsMap) {
      primitives.set(String(name), schema);
    }
  }

  // Pull metadata for each primitive from named exports of the catalog module.
  let maxVersion = "0.0.0";
  for (const name of primitives.keys()) {
    const exportName = `${name}Meta`;
    const exported = module[exportName];
    if (exported && typeof exported === "object") {
      const m = exported as PrimitiveMeta;
      meta.set(name, m);
      if (m.version && compareVersions(m.version, maxVersion) > 0) {
        maxVersion = m.version;
      }
    }
  }

  return {
    primitives,
    index: indexUnion as z.ZodTypeAny,
    meta,
    catalogVersion: maxVersion,
  };
}

/** Loose semver-major.minor.patch compare; returns -1/0/1. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}
