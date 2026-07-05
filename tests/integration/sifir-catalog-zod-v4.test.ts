// Regression test — `compileCatalog`'s discriminated-union walk against a
// Zod v4-built catalog (packages/typescript/src/compile.ts).
//
// Bug: `compileCatalog` read the discriminated union's member schemas off
// Zod's precomputed `_def.optionsMap` — a `Map` that only exists on Zod v3's
// `ZodDiscriminatedUnion`. Zod v4 restructured `_def` (`options` array +
// `discriminator` field name, no `optionsMap`), so a catalog whose
// `PrimitiveNode` was built with Zod v4 compiled to `primitiveCount: 0`.
// `compose` still worked (it structurally parses against the raw `index`
// schema directly), but `discover`/`scaffold`/`explain` — which all iterate
// `compiled.primitives` — came up empty.
//
// Reproduced here against a fixture-copy of the real catalog that surfaced
// this: `@sifir/design-system/catalog/index.ts` builds its top-level
// `PrimitiveNode` as `z.discriminatedUnion("primitive", [Page,
// ...PageTreeNode.options])` — a union re-composed from another union's
// `.options` — and that repo pins `"zod": "^4.3.6"`, resolved nearest to the
// catalog file independent of `@composer/typescript`'s own `"zod": "^3.23.0"`.
// See tests/fixtures/sifir-design-system-catalog/README.md for exactly what
// is and isn't a byte-for-byte copy, and why the fixture uses a small
// hand-rolled Zod-v4-*shaped* shim (verified against the real `zod@4.4.3`
// package) rather than that real package itself.
//
// This file also covers a second, related bug against the same fixture:
// `scaffold()` (packages/core/src/api/scaffold.ts) serializes a primitive's
// schema with `zod-to-json-schema`, which — like `compileCatalog`'s
// `optionsMap` walk above — only understands Zod v3's `_def` shape. Fed a
// Zod v4-built schema it recognizes none of it and silently returns `{}`
// rather than throwing, blinding agent tooling (`catalogDescribe` /
// `scaffold`'s whole purpose is handing back a filled-in schema). See
// packages/core/src/api/zod-json-schema.ts for the fix (detect the schema's
// own Zod major, route v4 to Zod v4's native `z.toJSONSchema()` resolved
// from the catalog's own "zod", same as this file's `zod-v4-shim` does for
// `compileCatalog`).

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetCatalogCacheForTests,
  _resetCompiledCatalogCacheForTests,
  compileCatalog,
  loadCatalog,
} from "@composer/typescript";

const COMPOSER_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const FIXTURE = join(COMPOSER_ROOT, "tests", "fixtures", "sifir-design-system-catalog");
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");

function makeSifirCatalogFixture(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-sifir-catalog-"));
  cpSync(FIXTURE, projectRoot, { recursive: true, dereference: true });
  // Baseline node_modules (zod v3 + friends) at the project root, same as
  // every other fixture.
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");
  // Shadow it with the fixture's Zod-v4-shaped shim (see
  // tests/fixtures/sifir-design-system-catalog/zod-v4-shim/) one level
  // down, at design/node_modules — the catalog files live under
  // design/{catalog,src}/, so Node's upward node_modules search finds
  // design/node_modules/zod BEFORE the project root's v3 one. This is
  // exactly how the real cross-project mismatch happens: the design-system
  // repo's own zod (v4) resolves nearer to its catalog file than
  // @composer/typescript's zod (v3) ever gets a say. The shim (copied into
  // the tempdir alongside `design/` by the cpSync above) is used instead of
  // installing the real npm package as a workspace dependency — that was
  // tried first and rejected because it fed Zod v4 into pnpm's
  // whole-workspace peer-dependency resolution and silently flipped
  // `packages/mcp`'s `@modelcontextprotocol/sdk` dependency onto it.
  const designNodeModules = join(projectRoot, "design", "node_modules");
  mkdirSync(designNodeModules, { recursive: true });
  symlinkSync(join(projectRoot, "zod-v4-shim"), join(designNodeModules, "zod"), "dir");
  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("compileCatalog against a Zod v4-built discriminated union", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    _resetCatalogCacheForTests();
    _resetCompiledCatalogCacheForTests();
    project = makeSifirCatalogFixture();
  });

  afterEach(() => project.cleanup());

  it("loads the fixture catalog's PrimitiveNode as a Zod-v4-shaped union (sanity check)", async () => {
    const catalogDir = join(project.projectRoot, "design", "catalog");
    const loaded = await loadCatalog(catalogDir);
    const indexUnion = loaded.module["PrimitiveNode"] as {
      _def?: Record<string, unknown>;
    };
    // Zod v3's ZodDiscriminatedUnion carries a precomputed `optionsMap`;
    // Zod v4 does not. Asserting its absence here pins that this fixture is
    // actually exercising a v4-shaped union, not silently falling back to
    // the v3 zod at the project root — without this the rest of the test
    // could pass for the wrong reason.
    expect(indexUnion._def?.["optionsMap"]).toBeUndefined();
    expect(Array.isArray(indexUnion._def?.["options"])).toBe(true);
    expect(indexUnion._def?.["discriminator"]).toBe("primitive");
  });

  it("compiles a non-empty, correctly-named primitive map (was primitiveCount: 0 pre-fix)", async () => {
    const catalogDir = join(project.projectRoot, "design", "catalog");
    const loaded = await loadCatalog(catalogDir);
    const compiled = compileCatalog(loaded);

    // `Page` (added by the byte-copied catalog/index.ts) + the 8 members of
    // the trimmed `PageTreeNode` union spread into it.
    expect(compiled.primitives.size).toBe(9);
    expect(new Set(compiled.primitives.keys())).toEqual(
      new Set([
        "Page",
        "HeroSection",
        "CtaSection",
        "Section",
        "Container",
        "Hero",
        "Button",
        "Form",
        "TextField",
      ]),
    );

    // Metadata should resolve too — `PageMeta` is exported by the
    // byte-copied catalog/index.ts.
    expect(compiled.meta.get("Page")?.intent).toContain("Composer document");
    expect(compiled.catalogVersion).toBe("1.0.0");
  });

  it("discover() surfaces the fixture's primitives end-to-end (was empty pre-fix)", async () => {
    const { discover } = await import("@composer/core");
    const result = await discover(project.projectRoot);
    expect(result.primitives.length).toBe(9);
    expect(result.primitives.map((p) => p.name)).toContain("HeroSection");
    expect(result.catalog_version).toBe("1.0.0");
  });

  it("scaffold() returns a non-empty JSON schema for a Zod v4-authored primitive (was {} pre-fix)", async () => {
    // Bug: `zodToJsonSchema` (zod-to-json-schema, built against Zod v3's
    // `_def` shape) doesn't recognize a Zod v4-built schema's `_def` at all,
    // so it silently serializes to `{}` — no error, just an empty schema,
    // which blinds agent tooling calling `scaffold()` for any primitive from
    // a Zod v4-authored catalog (packages/core/src/api/scaffold.ts).
    const { scaffold } = (await import("@composer/core")) as {
      scaffold: (
        projectRoot: string,
        input: { kind: "primitive"; primitive: string },
      ) => Promise<{ schema: Record<string, unknown> }>;
    };

    const result = await scaffold(project.projectRoot, {
      kind: "primitive",
      primitive: "Button",
    });

    expect(result.schema).not.toEqual({});
    expect(result.schema).toMatchObject({
      type: "object",
      properties: {
        primitive: { const: "Button" },
        id: { type: "string" },
        label: { type: "string" },
      },
    });
  });
});
