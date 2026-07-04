# sifir-design-system-catalog fixture

Regression fixture for the Zod v3/v4 discriminated-union walk mismatch in
`packages/typescript/src/compile.ts` (`compileCatalog`'s `optionsMap` walk
only worked against Zod v3's `ZodDiscriminatedUnion`; Zod v4 restructured
`_def` and doesn't have `optionsMap`, so a catalog built with Zod v4 compiled
to `primitiveCount: 0` — `compose` still worked, but `discover`/`scaffold`/
`explain`, which iterate `compiled.primitives`, came up empty).

`design/catalog/index.ts` is a **byte-for-byte copy** of the real
`@sifir/design-system/catalog/index.ts` (see
`/Users/oner/Projects/sifir-design-system/catalog/index.ts` at the time this
fixture was created) — the actual file the bug was reported against. It
builds its top-level `PrimitiveNode` as:

```ts
export const PrimitiveNode = z.discriminatedUnion("primitive", [
  Page,
  ...PageTreeNode.options,
]);
```

— a discriminated union re-composed from another discriminated union's
`.options`, which is exactly the shape that surfaced the bug once `zod`
resolves to v4 (it does in the real repo: `@sifir/design-system`'s own
`package.json` pins `"zod": "^4.3.6"`, resolved nearest to the catalog file
when Composer's loader `tsImport`s it — independent of `@composer/typescript`
pinning `"zod": "^3.23.0"` for its *own* code).

`design/src/catalog/index.ts` and `design/src/slots.ts` are **not** copies —
they're small stand-ins for the real `../src/catalog/` (9 files, ~9.7k
lines, 58 primitives, reached through `@/registry/...` tsconfig path
aliases and pulling in the design system's full component tree: icon
libraries, gsap, motion, react, …) and `../src/slots.ts`. None of that is
relevant to the Zod-version bug; the stand-ins preserve the real shape that
matters — a flat Zod v4 `z.discriminatedUnion` over real primitive names
spanning every category (macro, layout-with-recursive-children, atom, form)
— at a fraction of the size, so the fixture is fast and self-contained.

`zod-v4-shim/` is a small hand-rolled stand-in for the real `zod@4.4.3`
package — NOT a real Zod build. It produces the exact `_def` / `.shape` /
`.options` runtime shape the real package does (verified directly against
it while building this fixture), covering only the API surface
`catalog/index.ts` and `src/catalog/index.ts` actually call. See its own
header comment for the full rationale, but in short: installing the real
npm package as an actual workspace dependency (even test-only, even via a
pnpm `npm:` alias) was tried first and rejected — it fed Zod v4 into pnpm's
whole-workspace peer-dependency resolution and silently flipped
`packages/mcp`'s `@modelcontextprotocol/sdk` dependency from its Zod v3 peer
onto v4, an unrelated, unwanted side effect on a real package. The shim
needs no install at all.

`design/node_modules/zod` is created **at test time** (not checked in) —
a symlink to `zod-v4-shim/`, made by the test after it copies this whole
fixture into a tempdir. It shadows the `zod@^3.23.0` that `tests/node_modules`
provides at the project root (composer's own toolchain version), so
anything under `design/` resolves the v4-shaped shim instead — reproducing,
with no runtime dependency on either the sifir-design-system repo or the
real Zod v4 package being present anywhere, the actual cross-project
Zod-version mismatch that triggered the bug.

See `tests/integration/sifir-catalog-zod-v4.test.ts`.
