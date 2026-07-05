// Unit coverage for `rewriteAdapterAliases` (packages/core/src/workspace/
// adapter-aliases.ts) at the function level — fast, no full compose()
// pipeline needed. Complements tests/integration/extends-adapter-src-alias
// .test.ts (a real end-to-end compose against a fixture adapter) with the
// specific edge cases a real-world adapter (@sifir/design-system) exposed
// that a synthetic fixture's simpler tsconfig.json/import shape didn't:
//
//   1. A real adapter's tsconfig.json is commonly JSONC (whole-line `//`
//      comments) — a plain `JSON.parse` throws, and this module's own
//      "failed to parse" contract silently swallows that into "no paths
//      declared", skipping every rewrite with no error at all.
//   2. `src/` is scanned (not just accepted as a valid TARGET), because a
//      real adapter's own `src/**` files commonly use the SAME alias
//      self-referentially — @sifir/design-system's `src/catalog/atoms.ts`
//      imports `@/core/icons/icons-generated` the same way `catalog/
//      index.ts` imports `@/registry/*`.
//   3. An alias that matches a `paths` pattern but resolves to no file at
//      all must be left untouched, not thrown — some of a real adapter's
//      own files (component-layer helpers, `templates/prep/*.ts`) reference
//      an alias only a CONSUMING SITE resolves at its own build time, and
//      this engine's whole-tree scan runs over files regardless of whether
//      a compose ever actually loads them.
//   4. Unchanged regression guard: an alias resolving to a REAL file outside
//      every copied root still throws — this engine has no way to know
//      copying that file too is safe/intended.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rewriteAdapterAliases } from "@composer/core";

let pkgPath: string;
let destRoot: string;

/** Materialize `catalog/` (+ optionally `src/`) from `pkgPath` into
 * `destRoot`, mirroring `resolveAndCacheParent`'s own copy step (cpSync,
 * verbatim) before the rewrite runs against the copy. */
function materialize(dirs: string[]): void {
  for (const dir of dirs) {
    cpSync(join(pkgPath, dir), join(destRoot, dir), { recursive: true });
  }
}

beforeEach(() => {
  pkgPath = mkdtempSync(join(tmpdir(), "composer-alias-pkg-"));
  destRoot = mkdtempSync(join(tmpdir(), "composer-alias-dest-"));
});

afterEach(() => {
  rmSync(pkgPath, { recursive: true, force: true });
  rmSync(destRoot, { recursive: true, force: true });
});

describe("rewriteAdapterAliases", () => {
  it("loads paths from a JSONC tsconfig.json (whole-line // comments) instead of silently finding none", () => {
    writeFileSync(
      join(pkgPath, "tsconfig.json"),
      [
        "{",
        '  "compilerOptions": {',
        '    "baseUrl": ".",',
        "    // this comment used to make JSON.parse throw, silently",
        "    // swallowed into \"no paths declared\" — see this file's header.",
        '    "paths": { "@/*": ["./src/*"] }',
        "  }",
        "}",
      ].join("\n"),
      "utf8",
    );
    mkdirSync(join(pkgPath, "catalog"), { recursive: true });
    writeFileSync(
      join(pkgPath, "catalog", "index.ts"),
      'import { Foo } from "@/foo";\nexport { Foo };\n',
      "utf8",
    );
    mkdirSync(join(pkgPath, "src"), { recursive: true });
    writeFileSync(join(pkgPath, "src", "foo.ts"), "export const Foo = 1;\n", "utf8");

    materialize(["catalog", "src"]);

    const rewritten = rewriteAdapterAliases(destRoot, pkgPath);
    expect(rewritten).toHaveLength(1);
    const out = readFileSync(join(destRoot, "catalog", "index.ts"), "utf8");
    expect(out).toContain('from "../src/foo.js"');
    expect(out).not.toContain("@/foo");
  });

  it("rewrites a self-referencing alias INSIDE the copied src/ tree, not just catalog/'s own imports", () => {
    writeFileSync(
      join(pkgPath, "tsconfig.json"),
      JSON.stringify(
        { compilerOptions: { baseUrl: ".", paths: { "@/registry/*": ["./src/registry/*"] } } },
        null,
        2,
      ),
      "utf8",
    );
    mkdirSync(join(pkgPath, "catalog"), { recursive: true });
    writeFileSync(
      join(pkgPath, "catalog", "index.ts"),
      'import { Foo } from "@/registry/foo";\nexport { Foo };\n',
      "utf8",
    );
    mkdirSync(join(pkgPath, "src", "registry"), { recursive: true });
    // foo.ts uses the SAME adapter-internal alias to reach a sibling file —
    // exactly @sifir/design-system's src/catalog/atoms.ts -> @/core shape.
    writeFileSync(
      join(pkgPath, "src", "registry", "foo.ts"),
      'import { Bar } from "@/registry/bar";\nexport const Foo = Bar + 1;\n',
      "utf8",
    );
    writeFileSync(join(pkgPath, "src", "registry", "bar.ts"), "export const Bar = 1;\n", "utf8");

    materialize(["catalog", "src"]);

    const rewritten = rewriteAdapterAliases(destRoot, pkgPath);
    // catalog/index.ts AND src/registry/foo.ts both had an alias to rewrite.
    expect(rewritten).toHaveLength(2);

    const catalogOut = readFileSync(join(destRoot, "catalog", "index.ts"), "utf8");
    expect(catalogOut).toContain('from "../src/registry/foo.js"');

    const fooOut = readFileSync(join(destRoot, "src", "registry", "foo.ts"), "utf8");
    expect(fooOut).toContain('from "./bar.js"');
    expect(fooOut).not.toContain("@/registry/bar");
  });

  it("leaves an alias untouched (no throw) when it matches a paths pattern but resolves to no file at all", () => {
    writeFileSync(
      join(pkgPath, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["./src/*"], "@/config/*": ["./does-not-exist/*"] },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    mkdirSync(join(pkgPath, "src"), { recursive: true });
    // Mirrors @sifir/design-system's src/**/types.ts referencing
    // `@/config/complexity` — a module only a CONSUMING SITE ever
    // generates, never present in the adapter package itself.
    writeFileSync(
      join(pkgPath, "src", "widget.ts"),
      'import { COMPLEXITY } from "@/config/complexity";\nexport const Widget = COMPLEXITY;\n',
      "utf8",
    );

    materialize(["src"]);

    expect(() => rewriteAdapterAliases(destRoot, pkgPath)).not.toThrow();
    const out = readFileSync(join(destRoot, "src", "widget.ts"), "utf8");
    // Untouched — no valid target, but also no crash for a file that a real
    // compose may never even load.
    expect(out).toContain('from "@/config/complexity"');
  });

  it("still throws when an alias resolves to a REAL file outside every copied root", () => {
    writeFileSync(
      join(pkgPath, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./other/*"] } } }, null, 2),
      "utf8",
    );
    mkdirSync(join(pkgPath, "catalog"), { recursive: true });
    writeFileSync(
      join(pkgPath, "catalog", "index.ts"),
      'import { Foo } from "@/foo";\nexport { Foo };\n',
      "utf8",
    );
    // A real file — just outside catalog/templates/output.map.ts/audit.ts/src,
    // and never copied into destRoot.
    mkdirSync(join(pkgPath, "other"), { recursive: true });
    writeFileSync(join(pkgPath, "other", "foo.ts"), "export const Foo = 1;\n", "utf8");

    materialize(["catalog"]);

    expect(() => rewriteAdapterAliases(destRoot, pkgPath)).toThrow(/outside/);
  });
});
