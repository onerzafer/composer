// v0.2 deferral #1 — catalog caching across composes.
//
// `loadCatalog`/`compileCatalog` cache in-process, keyed by a content hash of
// the catalog's source files (see `hashCatalogSources`). Verifies: (1) a
// cache hit returns the identical module/compiled-catalog instance instead
// of re-transpiling, (2) editing a catalog source file invalidates the
// cache, and (3) `catalog/ingested/` — structurally invisible per FR-023 —
// does not affect the hash.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  compileCatalog,
  hashCatalogSources,
  loadCatalog,
  _resetCatalogCacheForTests,
  _resetCompiledCatalogCacheForTests,
} from "@composer/typescript";
import { makeFixture, STUB_CATALOG_INDEX, type Fixture } from "../helpers/fixture.js";

let fixture: Fixture;
let catalogDir: string;

beforeEach(() => {
  _resetCatalogCacheForTests();
  _resetCompiledCatalogCacheForTests();
  fixture = makeFixture({ files: { "catalog/index.ts": STUB_CATALOG_INDEX } });
  catalogDir = join(fixture.workspaceRoot, "catalog");
});

afterEach(() => fixture.cleanup());

describe("catalog cache (v0.2 deferral #1)", () => {
  it("hashCatalogSources is stable for identical content across different directories", () => {
    const other = makeFixture({ files: { "catalog/index.ts": STUB_CATALOG_INDEX } });
    try {
      const hashA = hashCatalogSources(catalogDir);
      const hashB = hashCatalogSources(join(other.workspaceRoot, "catalog"));
      expect(hashA).toBe(hashB);
    } finally {
      other.cleanup();
    }
  });

  it("loadCatalog returns the cached module instance on a second call (same content)", async () => {
    const first = await loadCatalog(catalogDir);
    const second = await loadCatalog(catalogDir);
    expect(second.module).toBe(first.module); // same object reference → cache hit, no re-transpile
    expect(second.contentHash).toBe(first.contentHash);
  });

  it("compileCatalog returns the cached CompiledCatalog instance on a second call (same content)", async () => {
    const loaded = await loadCatalog(catalogDir);
    const compiledA = compileCatalog(loaded);
    const compiledB = compileCatalog(loaded);
    expect(compiledB).toBe(compiledA);
    expect(compiledB.primitives.has("Hero")).toBe(true);
  });

  it("editing a catalog source file changes the hash and invalidates the cache", async () => {
    const first = await loadCatalog(catalogDir);

    // Add a second primitive to the union — a real content change.
    const edited = STUB_CATALOG_INDEX.replace(
      'export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero]);',
      [
        'export const Section = z.object({ primitive: z.literal("Section"), id: z.string() }).strict();',
        "export const SectionMeta = { primitive: \"Section\", version: \"1.0.0\", intent: \"x\", whenToUse: \"x\", whenNotToUse: [], fieldGuidance: {}, examples: [] } as const;",
        'export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero, Section]);',
      ].join("\n"),
    );
    writeFileSync(join(catalogDir, "index.ts"), edited, "utf8");

    const second = await loadCatalog(catalogDir);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(second.module).not.toBe(first.module);

    const compiled = compileCatalog(second);
    expect(Array.from(compiled.primitives.keys()).sort()).toEqual(["Hero", "Section"]);
  });

  it("catalog/ingested/ is structurally invisible to the content hash (FR-023)", () => {
    const before = hashCatalogSources(catalogDir);

    const ingestedDir = join(catalogDir, "ingested");
    mkdirSync(ingestedDir, { recursive: true });
    writeFileSync(
      join(ingestedDir, "draft.ts"),
      'export const Draft = { primitive: "Draft" };\n',
      "utf8",
    );

    const after = hashCatalogSources(catalogDir);
    expect(after).toBe(before);
  });
});
