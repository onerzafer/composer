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
 * Process-local cache of compiled catalogs, keyed by the same content hash
 * as `CATALOG_MODULE_CACHE` in loader.ts (`loaded.contentHash`). Compiling is
 * already cheap relative to the `tsx` transpile it follows, but caching it
 * too means a cache hit skips the discriminated-union walk as well, and
 * gives `compileCatalog` the same invalidate-on-change guarantee as the load
 * step it wraps.
 */
const COMPILED_CATALOG_CACHE = new Map<string, CompiledCatalog>();

/**
 * Inspect a loaded catalog module and produce its runtime view.
 * Convention: catalog must export `PrimitiveNode` (the discriminated union),
 * and one `<Name>Meta` object per primitive (e.g., `HeroMeta`, `SectionMeta`).
 * Cached in-process by `loaded.contentHash` — see `COMPILED_CATALOG_CACHE`.
 */
export function compileCatalog(loaded: LoadedCatalog): CompiledCatalog {
  const cached = COMPILED_CATALOG_CACHE.get(loaded.contentHash);
  if (cached) return cached;

  const module = loaded.module;
  const indexUnion = module["PrimitiveNode"];
  if (!indexUnion || typeof indexUnion !== "object") {
    throw new Error(
      "Catalog index.ts must export `PrimitiveNode` (a `z.discriminatedUnion`).",
    );
  }

  const primitives = new Map<string, z.ZodTypeAny>();
  const meta = new Map<string, PrimitiveMeta>();

  // Walk the discriminated union's own options + discriminator field name
  // rather than relying on Zod's precomputed `_def.optionsMap` — that Map
  // only exists on Zod v3's `ZodDiscriminatedUnion`. Zod v4 restructured
  // `_def` (`options` array + `discriminator` field name, no `optionsMap`),
  // so a catalog whose `PrimitiveNode` was built against a different Zod
  // major version than this package's own (e.g. a Zod v4 catalog — such as
  // a discriminated union re-composed from another discriminated union's
  // `.options`, a common cross-catalog authoring pattern) silently walked to
  // an empty Map: primitiveCount 0. compose still "worked" (it delegates
  // structural parsing to the raw `index` schema itself), but
  // discover/scaffold/explain — which iterate `compiled.primitives` — came
  // up empty. `_def.options` (array of member schemas) and
  // `_def.discriminator` (the field name) are present on both major
  // versions, so walking those directly and reading each option's own
  // discriminator-field literal value(s) off its `.shape` works across both.
  const def = (indexUnion as { _def?: Record<string, unknown> })._def;
  const options = def?.["options"];
  const discriminatorKey = def?.["discriminator"];
  if (Array.isArray(options) && typeof discriminatorKey === "string") {
    for (const option of options as z.ZodTypeAny[]) {
      const shape = (option as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape;
      const fieldSchema = shape?.[discriminatorKey];
      for (const value of discriminatorLiteralValues(fieldSchema)) {
        primitives.set(value, option);
      }
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

  const compiled: CompiledCatalog = {
    primitives,
    index: indexUnion as z.ZodTypeAny,
    meta,
    catalogVersion: maxVersion,
  };
  COMPILED_CATALOG_CACHE.set(loaded.contentHash, compiled);
  return compiled;
}

/** Test-only escape hatch: clears the process-local compiled-catalog cache. */
export function _resetCompiledCatalogCacheForTests(): void {
  COMPILED_CATALOG_CACHE.clear();
}

/**
 * Extract the literal discriminator value(s) a discriminated-union member's
 * discriminator field accepts. Handles both Zod major versions' internal
 * `_def` shapes for the two discriminator kinds Zod's own
 * `discriminatedUnion()` supports:
 *   - `ZodLiteral` — v3: `{ typeName: "ZodLiteral", value }` (single value);
 *     v4: `{ type: "literal", values: [...] }` (one or more values).
 *   - `ZodEnum` — v3: `{ typeName: "ZodEnum", values: [...] }`; v4:
 *     `{ type: "enum", entries: { KEY: value, ... } }`.
 * Returns an empty array (rather than throwing) for any other schema shape
 * so an unrecognized/wrapped discriminator field is skipped, not fatal.
 */
function discriminatorLiteralValues(fieldSchema: unknown): string[] {
  const def = (fieldSchema as { _def?: Record<string, unknown> } | undefined)?._def;
  if (!def) return [];
  // v4 ZodLiteral's `values` and v3 ZodEnum's `values` are both plain arrays
  // of the accepted literal values — same handling covers both.
  if (Array.isArray(def["values"])) {
    return (def["values"] as unknown[]).map(String);
  }
  // v3 ZodLiteral: single `value`.
  if ("value" in def && def["value"] !== undefined) {
    return [String(def["value"])];
  }
  // v4 ZodEnum: `entries` record of key → value.
  const entries = def["entries"];
  if (entries && typeof entries === "object") {
    return Object.values(entries as Record<string, unknown>).map(String);
  }
  return [];
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
