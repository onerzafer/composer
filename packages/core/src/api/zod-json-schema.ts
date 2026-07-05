// Serialize a catalog primitive's Zod schema to JSON Schema for scaffold()'s
// agent-facing `schema` field — across BOTH Zod major versions a catalog
// might be authored against.
//
// Bug this fixes: `zod-to-json-schema` (this package's pinned dependency,
// built for Zod v3) walks a schema's internal `_def` shape expecting Zod
// v3's layout (`_def.typeName`, e.g. "ZodObject"). Zod v4 restructured
// `_def` entirely — lowercase `_def.type` strings, no `typeName` at all
// (see `packages/typescript/src/compile.ts`'s identical v3/v4 `_def` split,
// applied there to discriminated-union member walking). Fed a v4-built
// schema, `zod-to-json-schema` doesn't recognize any of it and silently
// returns `{}` — no error, just an empty schema. `scaffold()`'s entire job
// is to hand the agent a filled-in schema to author against, so an empty
// schema silently blinds every agent using that primitive.
//
// Fix: detect the schema's own Zod major from its `_def` shape, and route
// to the matching serializer:
//   - v3 → `zod-to-json-schema` (this package's own pinned v3 dependency —
//     correct for a v3-built schema).
//   - v4 → Zod v4's own *native* `z.toJSONSchema()` export — but resolved
//     from wherever the CATALOG's own "zod" resolves (this package's own
//     "zod" is pinned to v3 and has no `toJSONSchema` export at all), using
//     the same nearest-`node_modules` lookup Node's own resolver used when
//     the catalog file itself ran `import { z } from "zod"` (see
//     `packages/typescript/src/loader.ts`, which `tsImport`s the catalog
//     from its own directory).
//
// This mirrors the exact cross-project mismatch that surfaced the bug:
// `@sifir/design-system`'s catalog pins `"zod": "^4.3.6"`, resolved nearest
// to the catalog file, independent of `@composer/core`'s own `"zod": "^3.23.0"`.

import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface CatalogSchemaToJsonSchemaOptions {
  /** Name to give the root schema (only consulted on the Zod v3 path). */
  name: string;
  /** Absolute path to the catalog directory the schema was loaded from. */
  catalogDir: string;
}

/**
 * Serialize `schema` to JSON Schema, detecting whether it was built against
 * Zod v3 or Zod v4 and using the matching serializer for each.
 */
export async function catalogSchemaToJsonSchema(
  schema: z.ZodTypeAny,
  options: CatalogSchemaToJsonSchemaOptions,
): Promise<Record<string, unknown>> {
  if (isZodV4Schema(schema)) {
    const toJSONSchema = await resolveZodV4ToJsonSchema(options.catalogDir);
    return toJSONSchema(schema) as Record<string, unknown>;
  }
  return zodToJsonSchema(schema as Parameters<typeof zodToJsonSchema>[0], {
    name: options.name,
    $refStrategy: "none",
  }) as Record<string, unknown>;
}

/**
 * Zod v3 schema `_def`s carry a `typeName` discriminator (e.g. "ZodObject",
 * "ZodString", "ZodEffects" for a `.superRefine()`-wrapped schema). Zod v4
 * dropped `typeName` entirely in favor of a lowercase `type` string (e.g.
 * "object", "string") and does not wrap `.superRefine()` in a separate
 * type — see `compile.ts`'s identical split, applied there to
 * discriminated-union member walking.
 */
function isZodV4Schema(schema: unknown): boolean {
  const def = (schema as { _def?: Record<string, unknown> } | undefined)?._def;
  if (!def) return false;
  return typeof def["type"] === "string" && typeof def["typeName"] !== "string";
}

/**
 * Resolve the "zod" package nearest `catalogDir` — the same
 * nearest-`node_modules` walk Node used to resolve the catalog file's own
 * `import "zod"` when it was `tsImport`-ed (see loader.ts) — and return its
 * `toJSONSchema` export.
 *
 * Throws a descriptive error rather than silently falling back to an empty
 * schema: a v4-shaped schema with no resolvable v4 "zod" package alongside
 * it is a real misconfiguration (this package's own "zod" dependency is
 * pinned to v3 and deliberately never consulted here), not something to
 * paper over — that silent fallback is the exact bug this function fixes.
 */
async function resolveZodV4ToJsonSchema(
  catalogDir: string,
): Promise<(schema: unknown) => unknown> {
  // `createRequire` only needs a path to derive a resolution starting
  // directory from — the file itself need not exist on disk. Passing
  // `<catalogDir>/index.ts` mirrors exactly the file loader.ts's
  // `tsImport(indexPath, ...)` resolved the catalog's own "zod" import from.
  const req = createRequire(join(catalogDir, "index.ts"));
  let zodPath: string;
  try {
    zodPath = req.resolve("zod");
  } catch (err) {
    throw new Error(
      `ZOD_V4_UNRESOLVABLE: this primitive's schema is Zod-v4-shaped, but no ` +
        `"zod" package resolves from ${catalogDir} to serialize it with (Zod ` +
        `v4's toJSONSchema is a native export of Zod v4 itself, not reimplemented ` +
        `here): ${(err as Error).message}`,
    );
  }
  const mod = (await import(pathToFileURL(zodPath).href)) as {
    toJSONSchema?: (schema: unknown) => unknown;
    z?: { toJSONSchema?: (schema: unknown) => unknown };
  };
  const toJSONSchema = mod.toJSONSchema ?? mod.z?.toJSONSchema;
  if (typeof toJSONSchema !== "function") {
    throw new Error(
      `ZOD_V4_TOJSONSCHEMA_MISSING: "zod" resolved from ${catalogDir} (${zodPath}) ` +
        `has no toJSONSchema export — expected a Zod v4 package.`,
    );
  }
  return toJSONSchema;
}
