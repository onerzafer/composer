# Authoring a Custom Composer Adapter

A Composer adapter is a regular npm package that ships:

1. **A catalog** — `catalog/index.ts` exporting a Zod `discriminatedUnion("primitive", […])` plus one `<Name>Meta` object per primitive.
2. **Templates** — `templates/<primitive>.<language>.hbs` per output language.
3. **An output map** — `output.map.ts` declaring which primitives emit files and where.
4. **(Optional) audit rules** — `audit.ts` for cross-spec checks.
5. **(Optional) bootstrap** — `bootstrap.ts` that seeds a starter spec when adopters run `composer init --extends <your-pkg>`.

A complete reference adapter lives at `packages/adapter-next/`. A minimal one (tiny key/value emitter, ~80 LOC) lives at `tests/fixtures/custom-adapter-keyvalue/`.

---

## Package layout

```
@your-scope/composer-adapter-foo/
├── package.json            { "type": "module", "exports": {…} }
├── catalog/
│   └── index.ts            export { … } from "zod" — primitives + meta + PrimitiveNode
├── templates/
│   ├── page.tsx.hbs        Handlebars templates per (primitive, language)
│   └── card.tsx.hbs
├── output.map.ts           default export an `OutputMap`
├── audit.ts                (optional) default export an `AuditRule`
├── bootstrap.ts            (optional) default export a `BootstrapFn`
└── index.ts                `defineAdapter({…})` — aggregate for npm consumers
```

`package.json` must include `./package.json` in its `exports` so Composer's resolver can `require.resolve(<pkg>/package.json)`:

```json
{
  "name": "@your-scope/composer-adapter-foo",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./package.json": "./package.json"
  }
}
```

Composer treats the adapter as ordinary npm code with respect to trust — there is no signing or allowlist in v0.1.

---

## 1. Catalog

Every primitive is a strict Zod object whose `primitive` field is a discriminator literal:

```ts
// catalog/index.ts
import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";

export const Hero = z.object({
  primitive: z.literal("Hero"),
  id: z.string(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
}).strict();

export const HeroMeta: PrimitiveMeta = {
  primitive: "Hero",
  version: "1.0.0",
  intent: "Top-of-page focal block.",
  whenToUse: "Page hero anchoring the section.",
  whenNotToUse: ["Skip when the section already has an OverlayHero"],
  fieldGuidance: {
    title: "1-line action-oriented",
    subtitle: "≤120 chars",
  },
  examples: [{ primitive: "Hero", id: "demo", title: "Hello world" }],
};

export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero /*, …*/]);
```

The `PrimitiveNode` discriminated union is what Composer's `structuralValidate` phase parses the agent's JSON against. Every `<Name>Meta` object feeds the `discover` and `scaffold` MCP tools so the agent sees `intent`/`whenToUse`/`whenNotToUse`/`fieldGuidance`/`examples` (constitution X — "Catalog Is the API").

---

## 2. Templates

Templates are Handlebars files named `<primitive>.<language>.hbs` (lowercase primitive name). The `language` segment matches the `language` field in your output map.

```hbs
{{!-- templates/hero.tsx.hbs --}}
{{!-- from: spec={{spec_path}} primitive=Hero id={{id}} --}}
export function Hero_{{id}}() {
  return (
    <section className="hero">
      <h1>{{title}}</h1>
      {{#if subtitle}}<p>{{subtitle}}</p>{{/if}}
    </section>
  );
}
```

Helpers available in every template:

| Helper | Purpose |
|---|---|
| `{{json x}}` | JSON-stringify x with stable key ordering |
| `{{kebab "Hello World"}}` | "hello-world" |
| `{{eq a b}}` | Truthy if a === b — useful inside `{{#if …}}` |
| `{{slot "PrimitiveName" variant=…}}` | Render a slot from the slot registry |
| `{{indent " " block}}` | Indent every line of a sub-render |
| `{{renderPrimitive node}}` | Delegate to an *embedded* child primitive's own `<primitive>.<language>.hbs` file and splice its output inline |

The 30-line discipline (constitution V): a primitive's template should fit on one screen. `composer doctor` flags violators.

### Embedded primitives still get their own template file

A primitive with no `byPrimitive` entry (§3) is embedded — it emits no file of
its own. That does **not** mean its markup should be hand-inlined into the
parent's template: give it its own `templates/<primitive>.<language>.hbs`
file like any other primitive, and have the parent delegate to it with
`{{renderPrimitive node}}` inside a `{{#each …}}` loop. `adapter-next`'s
`page.tsx.hbs` only owns page-level plumbing (imports, `<main>` wrapper); the
Hero/Section/Card/CTA markup each live in their own template and are spliced
in via `{{renderPrimitive}}` — this is what keeps every file, embedded or
not, inside the 30-line discipline.

### `*.prep.ts` files (v0.2)

A future companion file can pre-compute view data before rendering. The sandbox runtime exists in v0.1 (see `packages/core/src/render/sandbox.ts`); the loader wiring lands in v0.2. Until then, do all transformation in the template via helpers.

---

## 3. Output map

```ts
// output.map.ts
import type { OutputMap } from "@composer/adapter-kit";

const outputMap: OutputMap = {
  byPrimitive: {
    Page: (node) => [
      { path: `src/app/${node["slug"]}/page.tsx`, language: "tsx", policy: "overwrite" },
    ],
    // Hero, Section, etc. omitted — they render inline inside Page's template.
  },
  specsDir: "specs",
};

export default outputMap;
```

A primitive without a `byPrimitive` entry is **embedded** — its parent's template is responsible for rendering it inline. Don't add a no-op resolver; just omit the key.

All paths must resolve under the project root. Composer's `assertWithinProject` (research R10) rejects path traversal.

---

## 4. Audit rules

```ts
// audit.ts
import type { AuditRule } from "@composer/adapter-kit";

const audit: AuditRule = (ws) => {
  const errors: { spec_id: string | null; path: string | null; message: string }[] = [];
  // ws.specs: every spec in the workspace (including the one under compose).
  // ws.catalog: the compiled catalog.
  // ws.tokens: design tokens from tokens.json.
  for (const spec of ws.specs) {
    /* cross-spec rule, e.g. unique-slug, exactly-one-layout, etc. */
  }
  if (errors.length > 0) return { ok: false, errors, warnings: [] };
  return { ok: true, errors: [], warnings: [] };
};

export default audit;
```

When a project that **extends:** your adapter also ships its own `audit.ts`, both run during compose — yours first, then the project's. A failure from either aborts the entire compose.

---

## 5. Bootstrap

```ts
// bootstrap.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { BootstrapFn } from "@composer/adapter-kit";

export const bootstrap: BootstrapFn = (ctx) => {
  const starter = { primitive: "Page", slug: "home", title: "Welcome", tree: [/* … */] };
  const path = join(ctx.workspaceRoot, "specs", "home.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(starter, null, 2) + "\n", "utf8");
};

export default bootstrap;
```

`composer init --extends @your-scope/composer-adapter-foo` calls this once, then runs one sample compose on the starter spec it wrote. That sample compose is what proves the adapter works end-to-end on first install (US2 Acceptance #1).

---

## 6. Aggregate `index.ts`

```ts
import { defineAdapter } from "@composer/adapter-kit";
import { Hero, HeroMeta, PrimitiveNode } from "./catalog/index.js";
import outputMap from "./output.map.js";
import audit from "./audit.js";
import bootstrap from "./bootstrap.js";

export default defineAdapter({
  name: "@your-scope/composer-adapter-foo",
  version: "1.0.0",
  catalog: {
    primitives: { Hero: { schema: Hero, meta: HeroMeta } },
    slotRegistry: {},
    index: PrimitiveNode,
  },
  outputMap,
  audit,
  bootstrap,
});
```

`defineAdapter` is a typed pass-through — its only job is to give you structural type-checking against the `Adapter` interface.

---

## 7. Build + publish

Composer expects adapters to ship **compiled `.js` alongside `.ts`** so it can use Node's native `import()` for hot paths (see `tsconfig.json` examples in the reference adapters):

```jsonc
// tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": ".",          // in-place build so .js sits next to .ts
    "noEmit": false
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "**/*.d.ts"]
}
```

Add the in-place build outputs to `.gitignore` but include them via the package's `files` field so they ship to npm:

```jsonc
{
  "files": ["catalog", "templates", "output.map.js", "audit.js", "bootstrap.js", "index.js"]
}
```

Then publish:

```bash
npm publish --access public
```

---

## 8. Layering rules (when a project extends your adapter)

| Artifact | Resolution |
|---|---|
| `catalog/index.ts` | Project wins entirely if present; otherwise parent's is used. Primitive-shadow warnings are reported by `composer doctor`. |
| `templates/<file>.hbs` | Parent contributes first, project overrides by filename. `EffectiveWorkspace.templateOrigin` records which side won. |
| `output.map.ts` | Project wins entirely if present; otherwise parent's. |
| `audit.ts` | Both run — parent first, then project. Either may abort the compose. |
| `bootstrap.ts` | Only the parent's runs (during `composer init --extends`). |
| `tokens.json`, `guidelines.md` | Project-only (parent ignored). v0.2 will support merge strategies. |

---

## 9. Cycle detection

If your adapter itself sets `extends:` to another adapter in its own `composer.json`, Composer walks the chain at compose time. Cycles (`A → B → A`) are rejected with the full chain in the error message (FR-008).

---

## 10. Test your adapter before publishing

The simplest integration test pattern (from `tests/integration/custom-adapter.test.ts`):

```ts
import { compose } from "@composer/core";

const result = await compose(
  projectRoot,                            // project with composer.json: extends your adapter
  "demo-spec",
  { primitive: "Hero", id: "demo", title: "Hello" },
  { surface: "cli" },
);
expect(result.audit.ok).toBe(true);
expect(result.files_written[0]!.path).toBe("expected/output/path.tsx");
```

Run it via vitest. If the test passes, your adapter is ready.

---

## Further reading

- Constitution: `.specify/memory/constitution.md`
- Reference design: `docs/superpowers/specs/2026-05-25-composer-design.md`
- v0.1 spec: `specs/001-composer-toolkit-v0/spec.md`
- v0.2 deferrals (catalog primitive merging, prep loader, etc.): `docs/v0.2-deferrals.md`
