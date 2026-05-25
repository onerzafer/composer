# Composer — Toolkit Design (v0.1 → v1.0)

| Field | Value |
|---|---|
| Date | 2026-05-25 |
| Status | Draft — pending user review |
| Methodology source | [/README.md](../../../README.md) — Schema-Compiled Composition (SCC), 388 lines |
| Existence proof | `/Users/oner/Projects/sifir-ai/...` — `.sifir/` instance, ~3,500 LOC catalog, ~2,585 LOC codegen |
| Repository | `/Users/oner/Projects/composer` |

---

## 1. TL;DR

Composer is a **Node-based toolkit** that lets any LLM coding agent (Claude Code, Codex, Antigravity, Gemini CLI, OpenCode, …) attach to a Composer-instrumented project and execute the Schema-Compiled Composition loop: `discover → scaffold → [validate?] → compose`. The agent never writes source code; it composes JSON against a typed catalog, and Composer's engine deterministically lowers that JSON to real source files using project-provided Handlebars templates. Composer is the bridge between the coding agent and the project's codebase; it is not a runtime renderer.

## 2. Problem statement

Today, LLM coding agents invent ~95% of every feature (the standard-pattern part) and produce subtly broken results because they operate without constraint. The [Composer README](../../../README.md) lays out the SCC methodology that inverts this: humans hand-write the 5% as typed primitives, LLMs do the 95% as JSON composition against those primitives, a deterministic compiler emits real source.

The methodology is proven inside `sifir-ai/.sifir/`. What does **not** exist yet is:

1. A **shippable, project-agnostic toolkit** that any team can install into any project.
2. An **agent-facing surface** (MCP + CLI + skills) so the loop is reachable from any modern coding agent.
3. A **first-class custom-adapter model** so the catalog/template content for any output ecosystem (Next.js, Hono, Postgres, anything) is decoupled from the engine and authorable by anyone.
4. An **adoption path** for brownfield projects with existing code that pre-dates Composer.

This document specifies the design that fills those gaps.

## 3. Relationship to the SCC methodology (README)

The README is the methodology bible: three surfaces (catalog / composition / compiler), the two-layer constraint (Zod + superRefine), the slot-registry pattern, the 30-line discipline, the language-theory framing (Total Functional Language, LLM-Hardened DSL), the prior-art landscape. **This document does not re-derive any of it.**

What this document specifies is the **toolkit shape** — packages, surfaces, file layout, MCP tools, pipeline, adapter model, phasing — that operationalizes the methodology in a shippable, generic form.

## 4. Non-goals (v0)

To keep v0 shippable, the following are explicitly out of scope and have been considered then deferred:

- **LSP server.** MCP already provides every LSP-equivalent for the primary audience (coding agents): schemas via `scaffold`, diagnostics via `validate`, hover docs via `fieldGuidance`, go-to-spec via `composer explain`. Human catalog authors get by with vanilla TypeScript LSP. Revisit only if a real human-authoring demand emerges.
- **Constrained decoding integration** (Outlines / XGrammar / Anthropic structured outputs). High leverage per README §12 but not on the critical path for "agent attaches and composes." Phase v1.0.
- **Migration codemods** (catalog version → version). README §10 failure mode #3 is real but deferred until at least one major catalog version bump is in flight. Phase v1.0.
- **More than one shipping adapter in v0.1.** Reference adapter is `@composer/adapter-next` only. `@composer/adapter-hono` and `@composer/adapter-postgres` follow in v0.2 to prove methodology beyond pages.
- **More than one skill pack in v0.1.** `@composer/skill-claude` only. Codex and Gemini follow in v1.0.
- **Brownfield ingestion** (auto-deriving primitives from existing code). Designed-for but deferred to v1.x (see §15).
- **Daemon mode / incremental recompile.** Asymptote of the design; v0 is one-shot per `compose` call.
- **BNF/EBNF formal grammar export.** Worth doing per README §12 but not before there's user demand.
- **Multi-engine catalog authoring** (Python, Rust as catalog languages). v0 is TS/Zod only and stays that way unless a real demand emerges.

## 5. Architecture overview

### 5.1 Package layout

```
@composer/core              engine library: discover, scaffold, validate, compose
                            (catalog loader, validator, renderer, drift detector,
                             source-map emitter, audit runner)

@composer/mcp               MCP server — one stdio binary, 4 tools
@composer/cli               CLI — composer init / compose / validate / explain /
                            doctor / trace
@composer/typescript        catalog-authoring engine (Zod + superRefine)
                            referenced by composer.json's `engine` field

@composer/adapter-kit       shared types/utilities for adapter authors:
                            Adapter, OutputMap, AuditRule, PrepFn types

@composer/adapter-next      reference adapter — Next.js App Router (v0.1)
@composer/adapter-hono      reference adapter — Hono API routes      (v0.2)
@composer/adapter-postgres  reference adapter — migrations + RLS     (v0.2)

@composer/skill-claude      Claude Code skill bundle (prose + MCP config) (v0.1)
@composer/skill-codex       Codex extension                                (v1.0)
@composer/skill-gemini      Gemini CLI skill                                (v1.0)
```

All non-core packages depend on `@composer/core`. The MCP and CLI are surfaces over the core lib; adapters are content providers (templates, output maps, audit rules, bootstrap); skills are agent-platform wrappers (prose + MCP config).

### 5.2 Surface layering

```
              ┌──────────────────────────┐
              │     @composer/core       │  engine library
              │  (discover, scaffold,    │
              │   validate, compose,     │
              │   drift, source-map)     │
              └──┬───────────────────┬───┘
                 │                   │
       ┌─────────┴─────────┐ ┌───────┴────────┐
       │  @composer/mcp    │ │ @composer/cli  │  first-class surfaces
       │  (stdio MCP)      │ │ (binary CLI)   │
       └────────┬──────────┘ └────────────────┘
                │
   ┌────────────┴─────────────┐
   │ @composer/skill-claude   │
   │ @composer/skill-codex    │  thin per-platform skills
   │ @composer/skill-gemini   │  (prose + MCP config)
   └──────────────────────────┘
```

The MCP server and the CLI are independent first-class surfaces; neither wraps the other. Both call into `@composer/core`. Skills are thin: prose + a `mcp.json` pointing at `@composer/mcp`.

## 6. Project model

### 6.1 `composer.json`

A small pointer file at the project root declares the workspace, the engine, and the optional parent adapter:

```jsonc
{
  "workspace": "./design",
  "engine":    "@composer/typescript@1",
  "extends":   "@composer/adapter-next@1"     // OPTIONAL
}
```

| Field | Meaning |
|---|---|
| `workspace` | Path to the conventional workspace folder (relative to composer.json). Default `./design`. |
| `engine` | Catalog-authoring engine. v0 always `@composer/typescript@1`. Reserved as a semver gate. |
| `extends` | Optional published adapter that seeds catalog/templates/output-map. Single value (no array in v0). |

`composer.json` is the only file Composer requires at the project root.

### 6.2 Workspace layout (conventional)

```
project-x/
├── composer.json
└── design/                            ← workspace folder
    ├── catalog/
    │   ├── primitives/
    │   │   ├── hero.ts                ← export const Hero = z.object({...})
    │   │   ├── section.ts
    │   │   ├── form.ts
    │   │   └── ...
    │   ├── rules/
    │   │   └── semantic.ts            ← superRefine + audit rules
    │   ├── slot-registry.ts           ← README §4 slot-registry pattern
    │   ├── ingested/                  ← RESERVED — engine ignores this dir (v1.x ingestion lands here)
    │   └── index.ts                   ← discriminatedUnion("primitive", [...])
    │
    ├── templates/
    │   ├── hero.tsx.hbs
    │   ├── hero.prep.ts               ← optional
    │   ├── section.tsx.hbs
    │   └── ...
    │
    ├── specs/                         ← LLM output surface
    │   ├── landing.json               ← one spec per feature
    │   ├── pricing.json
    │   └── ...
    │
    ├── tokens.json                    ← optional design tokens (adapter-driven)
    ├── output.map.ts                  ← spec-kind → output-path mapping
    └── .composer/                     ← engine cache (gitignored)
        ├── cache/
        │   ├── catalog.compiled.js    ← compiled Zod schemas
        │   ├── sourcemap.json         ← spec ↔ file:line mapping
        │   ├── output.hashes.json     ← drift-detection state
        │   └── parent/                ← extends parent adapter (cached files)
        └── logs/
```

Output files are emitted to wherever the adapter's `output.map.ts` directs (commonly `src/`).

## 7. The agent interaction loop

### 7.1 MCP tools (workflow-only, no escape hatches)

The MCP server exposes **3 required tools + 1 optional preview tool**:

```ts
discover(): {
  project: { name, engine, adapter, version },
  primitives: [{ name, intent, whenToUse }],   // no schemas — light overview only
  specs: [{ id, summary, updated }],
  guidelines: string,                          // project-wide doctrine
  tokens: { colors, fonts, spacing, ... },     // adapter-flavored summary
  suggested_next: "scaffold"
}

scaffold(input:
    | { kind: "primitive", primitive: string, intent?: string }
    | { kind: "spec",      spec_id: string }
): {
  // when primitive:
  spec_id?: string,                            // server-suggested ID for new spec
  skeleton?: object,                           // starter JSON with placeholders
  schema?: object,                             // full Zod-as-JSON for that primitive
  fieldGuidance?: { [path: string]: string },
  whenNotToUse?: string[],
  examples?: object[],

  // when spec:
  json?: object,                               // existing spec content (read endpoint)

  suggested_next: "compose" | "validate"
}

validate(spec_id: string, json: object): {     // OPTIONAL preview; no writes
  ok: boolean,
  errors: [{ path, message, suggestion? }],
  warnings: [{ path, message }],
  would_write: [{ path, kind: "created" | "updated", diff }],
  suggested_next: "compose" | "scaffold"
}

compose(spec_id: string, json: object): {     // ATOMIC: validates + persists + emits
  spec_saved: string,                          // path to design/specs/<spec_id>.json
  files_written: [{ path, kind: "created" | "updated", diff }],
  audit: { ok: boolean, warnings: [...] },
  suggested_next: "done"
}
```

Workflow semantics:

- **`discover`** is always the entry point. The agent learns the catalog index, the existing specs, the project guidelines, and the design tokens. Light context (~1–3k tokens depending on catalog size).
- **`scaffold`** serves *double duty*: lazy-load a primitive's full schema/examples, OR read an existing spec's JSON for editing. This is the agent's only read endpoint into the catalog and workspace.
- **`validate`** is an optional dry-run. Returns errors + the would-write diff. No state change. Agents use this for cheap reality-checks before committing.
- **`compose`** is the single commit boundary. It is **atomic**: validates structurally + semantically, runs audits, writes the spec file, renders templates to a staging dir, drift-checks existing outputs, then atomic-renames staging → real paths. On any failure, nothing is written; the workspace and outputs are untouched.

There are no inspection escape hatches. There is no `list_primitives`, no `read_template`, no `generate` separate from `compose`. The agent's surface is the four tools above.

### 7.2 Concrete agent transcript (illustrative)

```text
agent → composer.discover()
composer → {
  project: { name: "acme-site", engine: "@composer/typescript@1",
             adapter: "@composer/adapter-next@1", version: "0.3.1" },
  primitives: [
    { name: "Hero",    intent: "...", whenToUse: "..." },
    { name: "Section", intent: "...", whenToUse: "..." },
    { name: "Card",    intent: "...", whenToUse: "..." },
    ...
  ],
  specs: [{ id: "home", summary: "landing page", updated: "..." }],
  guidelines: "...project doctrine...",
  tokens: { colors: { brand: "indigo", ... }, fonts: ["Inter", "Mono"] },
  suggested_next: "scaffold"
}

agent → composer.scaffold({ kind: "primitive", primitive: "Hero",
                            intent: "centered hero for pricing page" })
composer → {
  spec_id: "pricing",
  skeleton: { primitive: "Page", slug: "pricing",
              tree: [{ primitive: "Hero", id: "pricing-hero",
                       variant: "centered", title: "<FILL>", subtitle: "<FILL>",
                       cta: { primitive: "CTA", ... } }] },
  schema: { ...Zod-as-JSON... },
  fieldGuidance: { title: "1-line action-oriented", subtitle: "supporting" },
  whenNotToUse: ["use OverlayHero for image-led pages",
                 "use FormHero if conversion-first"],
  examples: [{ ...prior validated compositions... }],
  suggested_next: "compose"
}

(agent composes JSON in its own context)

agent → composer.validate("pricing", { ...drafted JSON... })
composer → {
  ok: false,
  errors: [
    { path: "tree[0].title", message: "expected non-empty string" },
    { path: "tree[2]",       message: "Card cannot be first child of Section",
      suggestion: "wrap with a Hero or move Card down" }
  ],
  would_write: [],
  suggested_next: "scaffold"
}

(agent fixes draft, calls compose)

agent → composer.compose("pricing", { ...fixed JSON... })
composer → {
  spec_saved: "design/specs/pricing.json",
  files_written: [
    { path: "src/app/pricing/page.tsx", kind: "created", diff: "+58 lines" },
    { path: "src/lib/forms/pricing.ts", kind: "updated", diff: "+3 -1" }
  ],
  audit: { ok: true, warnings: [] },
  suggested_next: "done"
}
```

## 8. Engine pipeline (inside `@composer/core`)

```
┌────────────────────────────────────────────────────────────┐
│  1. resolve workspace                                       │
│     1a. read composer.json                                  │
│     1b. if `extends`, resolve parent adapter from npm,      │
│         cache files in .composer/cache/parent/              │
│     1c. build effective workspace by layering parent + project │
│         (resolution rules in §13)                           │
│     1d. validate the effective workspace (e.g., no name     │
│         collisions unless explicitly shadowed)              │
└────────────────────────────────────────────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────┐
│  2. compile catalog                                         │
│     load design/catalog/index.ts via ts-import              │
│     extract z.discriminatedUnion                            │
│     compile to runtime Zod + cache in .composer/cache/      │
└────────────────────────────────────────────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────┐
│  3. dispatch by surface                                     │
│     MCP `discover/scaffold/validate/compose` → §7.1         │
│     CLI commands                          → §18             │
└────────────────────────────────────────────────────────────┘

                         compose path:
                              ▼
┌────────────────────────────────────────────────────────────┐
│  4. parse + structural validate (Zod)                       │
│     fast path; reports z.ZodError with paths                │
│                                                              │
│  5. semantic validate (superRefine + project rules)         │
│     runs adapter rules first, then project rules            │
│                                                              │
│  6. audit (cross-spec / project-wide rules)                 │
│     adapter audit.ts runs first, then project audit.ts      │
│                                                              │
│  7. render to staging                                        │
│     for each top-level node in tree:                         │
│       resolve template (project overrides parent)            │
│       optional prep(node, ctx) → renderCtx                   │
│       handlebars.render(template, renderCtx) → text          │
│       emit to .composer/staging/<output-path>                │
│     emit source-map to .composer/staging/sourcemap.json     │
│                                                              │
│  8. drift check                                              │
│     hash existing src/... files                              │
│     compare against .composer/cache/output.hashes.json       │
│     mismatch → ABORT with diff + remediation                 │
│                                                              │
│  9. atomic rename staging → real paths                       │
│     write spec to design/specs/<spec_id>.json                │
│     update .composer/cache/output.hashes.json                │
│     update .composer/cache/sourcemap.json                    │
│                                                              │
│ 10. post-write audit (optional, adapter-defined)             │
│     run type-check or eslint if adapter declares it          │
└────────────────────────────────────────────────────────────┘
```

**Rollback semantics**: any failure in steps 4–9 discards the staging dir. The workspace and outputs are untouched. The agent receives an error with the phase + a fix suggestion.

## 9. Catalog & semantic rules

### 9.1 Primitive record (from README §4)

Each primitive is a single TS file exporting one Zod schema plus metadata:

```ts
// design/catalog/primitives/hero.ts
import { z } from "zod";
import { HERO_VARIANTS } from "../slot-registry";

export const Hero = z.object({
  primitive: z.literal("Hero"),
  id:        z.string(),
  variant:   z.enum(Object.keys(HERO_VARIANTS) as ["centered", "overlay"]),
  title:     z.string().min(1),
  subtitle:  z.string().optional(),
  cta:       z.lazy(() => CTA),
}).strict();

export const HeroMeta = {
  primitive:     "Hero",
  intent:        "Top-of-page focal block with title + supporting copy + CTA",
  whenToUse:     "First impression for a section; primary visual anchor.",
  whenNotToUse:  [
    "Use OverlayHero for image-led pages",
    "Use FormHero when conversion is the primary goal",
  ],
  fieldGuidance: {
    title:    "1-line action-oriented",
    subtitle: "Supporting copy, max 2 lines",
  },
  examples: [
    { /* canonical composition */ },
  ],
} as const;
```

### 9.2 The catalog index

```ts
// design/catalog/index.ts
import { Hero } from "./primitives/hero";
import { Section } from "./primitives/section";
import { Card } from "./primitives/card";
// ...

export const PrimitiveNode = z.discriminatedUnion("primitive", [
  Hero, Section, Card, /* ... */
]);

export type PrimitiveNode = z.infer<typeof PrimitiveNode>;
```

### 9.3 Semantic rules (superRefine)

```ts
// design/catalog/rules/semantic.ts
export const semanticRules = (root: PageSchema) =>
  root.tree.forEach((node, i, tree) => {
    if (node.primitive === "Card" && i === 0) {
      throw new Error("Card cannot be first child of Section — wrap with Hero or reorder");
    }
  });
```

Semantic rules run AFTER structural Zod parsing in step 5 of the pipeline.

### 9.4 Slot registry (README §4)

```ts
// design/catalog/slot-registry.ts
import type { SlotEntry } from "@composer/adapter-kit";

export const HERO_VARIANTS = {
  centered: { importPath: "@/components/heroes",  exportName: "CenteredHero" },
  overlay:  { importPath: "@/components/heroes",  exportName: "OverlayHero"  },
} as const satisfies Record<string, SlotEntry>;
```

Adding a row simultaneously: extends the Zod enum (via `Object.keys` typing), tells templates what to import via `{{slot}}` helper, and gives TypeScript the union type. Drift is structurally impossible.

## 10. Template system

### 10.1 One Handlebars template per primitive per output file

Templates live at `design/templates/<name>.<output-ext>.hbs`. The extension before `.hbs` declares the output language: `hero.tsx.hbs` emits TSX, `migration.sql.hbs` emits SQL, `endpoint.rs.hbs` emits Rust.

```hbs
{{!-- design/templates/hero.tsx.hbs --}}
{{!-- from: {{spec_path}}:{{spec_line}} (Hero, id={{id}}) --}}
<{{slot "Hero" variant}}
  title={{{json title}}}
  subtitle={{{json subtitle}}}
  cta={{{json cta}}}
/>
```

Pure Handlebars: substitution + minimal iteration + helpers. No conditionals beyond simple `{{#if}}`. The 30-line discipline (README §4) applies.

### 10.2 Optional `.prep.ts` for non-trivial data shaping

```ts
// design/templates/hero.prep.ts
import type { PrepFn } from "@composer/adapter-kit";
import { HERO_VARIANTS } from "../catalog/slot-registry";

export const prep: PrepFn<HeroNode> = (node, ctx) => ({
  ...node,
  component: HERO_VARIANTS[node.variant].exportName,
  importPath: HERO_VARIANTS[node.variant].importPath,
});
```

Prep is the safety valve for slot-registry lookups, formatting, and any logic that would violate the template's 30-line discipline. Prep itself is also held to the 30-line discipline.

### 10.3 Sandbox

Templates have access only to:
- Their own node (via prep'd render context)
- The slot registry
- The design tokens object
- Composer-provided helpers: `{{json x}}`, `{{kebab x}}`, `{{slot family variant}}`, `{{indent n}}`

Templates have **no** filesystem access, **no** network access, **no** dynamic `eval`. The engine validates this by running prep in a Node `vm` context with a restricted globalThis.

### 10.4 Multi-language output

Composer is language-agnostic on the output side. The engine reads `<ext>.hbs`, runs Handlebars, writes to a file with the matching extension. Adapters for `Hono`, `Postgres`, `Rust-Axum`, `Python-FastAPI` (later) are all just different sets of templates with different extensions. The engine doesn't know or care which language is being emitted.

## 11. Output policy

### 11.1 Banner on every generated file

```tsx
// =====================================================================
// DO NOT EDIT. Generated by Composer.
//   spec:    design/specs/pricing.json
//   inspect: composer explain src/app/pricing/page.tsx:LINE
// =====================================================================
```

### 11.2 Per-block source-map comments

```tsx
// from: design/specs/pricing.json:7 (Page)
export default function PricingPage() {
  return (
    <>
      {/* from: design/specs/pricing.json:12 (Hero, id=pricing-hero) */}
      <CenteredHero
        title="Pricing built for teams"
        ...
```

### 11.3 Drift detection

Before any overwrite, the engine hashes the existing file and compares against `.composer/cache/output.hashes.json`. If the hash does not match the previous generation, **abort with diff**:

```text
ERROR: src/app/pricing/page.tsx has been edited by hand.
  diff:
    - title="Pricing"
    + title="Pricing built for teams"
  options:
    (a) git checkout src/app/pricing/page.tsx && composer compose pricing
    (b) lift the title change into design/specs/pricing.json,
        then composer compose pricing
```

### 11.4 Bi-directional source maps

The engine persists `.composer/cache/sourcemap.json` mapping both directions:

```bash
composer explain src/app/pricing/page.tsx:42
  → { spec_id: "pricing", spec_line: 12, primitive: "Hero", node_id: "pricing-hero" }

composer trace design/specs/pricing.json:12
  → [{ file: "src/app/pricing/page.tsx", line: 42 },
     { file: "src/lib/forms/pricing.ts", line: 9 }]
```

### 11.5 Idempotence

If nothing has changed (spec same, catalog same, templates same, hashes match), `compose` is a no-op. Safe to wire into file-watchers and CI.

## 12. Adapter model

### 12.1 The workspace IS the adapter

Every Composer-instrumented project authors adapter content in its `design/` workspace. Published adapters are pre-packaged starter content that a project optionally extends. There is no architectural distinction between "official" adapters and "custom" adapters — they're the same shape, different distribution.

### 12.2 `extends` mechanic

```jsonc
{
  "workspace": "./design",
  "engine":    "@composer/typescript@1",
  "extends":   "@composer/adapter-next@1"     // OPTIONAL
}
```

- **No `extends`** → workspace is fully self-contained. Project authors catalog, templates, rules, output map from scratch. Path for novel domains.
- **With `extends`** → published adapter's content is loaded first; workspace content layered on top.

### 12.3 Resolution rules (project vs parent adapter)

| File kind | Semantics |
|---|---|
| `templates/<name>.hbs` | Override by filename — project wins |
| `templates/<name>.prep.ts` | Override by filename — project wins |
| `catalog/primitives/<name>.ts` | Additive: project adds new primitives. Project shadows parent's by exporting same primitive name (with warning from `composer doctor`). |
| `catalog/rules/*.ts` | Additive merge — both sets run |
| `catalog/slot-registry.ts` | Additive merge — project adds new variants or new slots |
| `output.map.ts` | Override wholesale (parent's map replaced if project provides one) |
| `audit.ts` | Additive merge — parent runs first, project second |
| `bootstrap.ts` | Project's (if present) supersedes; parent's runs only on `composer init` |

Cycle detection on extends-chain is mandatory.

### 12.4 Adapter package layout

```
@acme/composer-adapter-rails/
├── package.json
├── catalog/primitives/...
├── templates/...
├── catalog/rules/...
├── catalog/slot-registry.ts
├── output.map.ts
├── audit.ts
├── bootstrap.ts            ← composer init seed (copies starter files)
└── index.ts                ← exports the adapter object via @composer/adapter-kit
```

Same structure as a workspace, packaged for distribution. Any team can ship its own adapter.

### 12.5 Reference adapters

| Package | Phase | Domain |
|---|---|---|
| `@composer/adapter-next` | v0.1 | Next.js App Router pages + forms |
| `@composer/adapter-hono` | v0.2 | Hono API routes + request/response schemas |
| `@composer/adapter-postgres` | v0.2 | Postgres migrations + RLS policies |
| (later) `@composer/adapter-rust-axum`, `@composer/adapter-python-fastapi` | post-v1 | demand-driven |

### 12.6 `@composer/adapter-kit`

A tiny package exporting types and helper utilities for adapter authors:

```ts
export type Adapter = { /* ... */ };
export type OutputMap = Record<SpecKind, OutputPath>;
export type AuditRule = (workspace: Workspace) => AuditResult;
export type PrepFn<N> = (node: N, ctx: RenderCtx) => RenderContext;
export type SlotEntry = { importPath: string; exportName: string };
```

Lets adapter authors write typed adapters without reverse-engineering the contract.

## 13. Skill packs

A skill pack (e.g., `@composer/skill-claude`) ships:

```
@composer/skill-claude/
├── SKILL.md                ← prose triggering on Composer-relevant prompts
├── mcp.json                ← { "composer": { "command": "npx",
│                                            "args": ["-y", "@composer/mcp"] } }
├── prompts/
│   ├── attached.md         ← "You are attached to a Composer project. Always
│   │                         call discover() first. Never write source files
│   │                         directly. Route every code change through compose."
│   ├── compose-feature.md  ← workflow guide
│   └── debugging.md        ← how to use composer explain
└── examples/
    └── ...
```

The skill is the prose layer that turns the bare MCP tools into a learnable workflow. The skill is per-agent; the MCP server is identical across all agents.

## 14. CLI surface

```bash
# v0.1
composer init [--extends <pkg>] [--bare]    initialize composer.json + workspace
composer compose <spec_id>                  run compose for a spec (mirrors MCP)
composer validate <spec_id>                 run validate preview
composer explain <file>:<line>              source-map code → spec
composer trace <spec>:<line>                inverse source-map spec → code
composer doctor                             health checks (drift, sprawl, bijection,
                                            unused primitives, LOC discipline,
                                            parent adapter version)

# v1.0 (reserved namespace)
composer migrate [--from X --to Y]          catalog version codemods
composer ingest <plugin> <source>           brownfield ingestion (see §15)
composer promote <ingested-file>            move from ingested/ to primitives/
```

The CLI mirrors MCP for `compose`/`validate`, and adds inspection/operation commands the MCP doesn't expose.

## 15. Adoption paths

### 15.1 Greenfield

```bash
$ composer init --extends @composer/adapter-next
✓ wrote composer.json
✓ scaffolded design/ from @composer/adapter-next
✓ wrote .gitignore entries (.composer/cache, .composer/logs)
✓ ran sample compose() — see src/app/page.tsx
```

### 15.2 Brownfield — manual

```bash
$ composer init --bare
✓ wrote composer.json (no extends)
✓ scaffolded empty design/ skeleton with example primitive
✓ wrote .gitignore entries
→ next: edit design/catalog/primitives/example.ts and design/templates/example.hbs
```

### 15.3 Brownfield — ingestion (v1.x)

For projects with existing code that pre-dates Composer, **ingester plugins** auto-derive primitives and templates from existing source. Output is deliberately staged into a quarantine dir; humans review and promote.

```
existing project source
         │
         ▼
┌────────────────────────────┐
│ composer ingest <plugin>    │   CLI command (not exposed via MCP)
│   <source-glob>             │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ ingester plugin             │
│   parse AST → derive shape  │
│   derive starter template   │
│   optionally LLM-propose    │
│   intent/whenToUse prose    │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ design/catalog/ingested/    │   QUARANTINE — engine ignores
│   hero.draft.ts             │   until promoted
│   hero.draft.tsx.hbs        │
│   README.md                 │   review instructions
└────────────────────────────┘
         │
   (human review: add semantic layer, whenNotToUse,
    rules, move to design/catalog/primitives/)
         │
         ▼
┌────────────────────────────┐
│ design/catalog/primitives/  │   canonical, now visible to engine
└────────────────────────────┘
```

Ingester plugins (v1.x):

| Plugin | Reads | Emits |
|---|---|---|
| `@composer/ingest-react` | `**/*.tsx` | Primitive per component, derived from prop types |
| `@composer/ingest-openapi` | `openapi.yaml` | Route + RequestSchema + ResponseSchema primitives |
| `@composer/ingest-prisma` | `prisma.schema` | Table + Column + ForeignKey + Policy primitives |
| `@composer/ingest-drizzle` | `src/db/schema.ts` | Same as prisma, Drizzle-flavored |
| `@composer/ingest-zod` | any `.ts` exporting Zod | Primitives matching the Zod shape |

Mechanical extraction uses **ts-morph**; LLM-assistance is opt-in via `--propose-with-llm`.

### 15.4 What v0 commits in support of ingestion (no cost now)

1. **`design/catalog/ingested/` is engine-ignored** — directory-name reservation, no runtime cost.
2. **Primitives are single TS files** exporting Zod + metadata — already true from §9. Flat enough for AST tools to write to.
3. **Templates are Handlebars + optional prep** — already true from §10. Simple enough for AST tools to emit.
4. **CLI namespace reserves `composer ingest` and `composer promote`** — no implementation in v0, just keeps the namespace clean.

### 15.5 Bijection check as ingester-correctness test

README §2 introduces the bijection check (JSON → code → JSON round-trip). When `composer/ingest-*` plugins ship, the bijection check naturally tests their correctness: ingest a component, compose with the resulting JSON, then ingest the generated output — the JSON should round-trip.

## 16. Failure modes (README §10 mapped to Composer behaviors)

| README failure mode | Composer behavior |
|---|---|
| #1 Primitive sprawl | `composer doctor` reports usage count + last-used per primitive; warns at >50 primitives or any unused >90d |
| #2 Composition vocabulary creep | No control-flow primitives in core. Adapters may add `forEach`/`when` but each must declare a fixed iteration model. `composer doctor` flags primitives named like `while` / `if` / `async` |
| #3 Catalog versioning | Each primitive declares `version: "1.0.0"`. Adapters declare a required engine range. `composer migrate` runs codemods (v1.0) |
| #4 Debugging shifts to mental model | Banner + per-block source-map comments + `composer explain`/`trace` (§11). Bi-directional traversal between spec and code |
| #5 State/effects don't compose | Primitives declare `pure: bool` and `effects: [...]`. Adapter audit can reject effectful primitives without retry/idempotency declarations |
| #6 Catalog becomes velocity bottleneck | `composer doctor` measures primitive-PR-to-release lag; warns if median > 7d. Cultural, not technical, but visible |

Atomic compose handles partial failures: any error in steps 4–9 of the pipeline discards staging; nothing is written. Error reports include the phase + a fix suggestion.

## 17. Testing strategy

### 17.1 Per-project tests (humans write these)

- **Catalog tests**: each primitive ships at least one positive example (parses + emits cleanly) and at least one negative example per `whenNotToUse` scenario (must fail validation).
- **Template snapshot tests**: render every example to file, snapshot-compare. Catches accidental template drift.

### 17.2 Engine-level tests (Composer-team writes these)

- **Bijection check**: for every primitive in the reference adapter, run JSON → code → JSON. Round-trip must hold. Part of CI.
- **Mock-agent integration tests**: a harness simulates an MCP agent calling `discover → scaffold → validate → compose` against a fixture project. Asserts expected tool returns + file writes.
- **Drift detection tests**: write generated file, edit by hand, run compose — must abort with diff.
- **Atomic rollback tests**: inject failure at each pipeline step 4–9; assert staging is discarded and workspace + outputs are untouched.
- **Adapter-extends tests**: parent adapter + child workspace; assert override and additive-merge rules in §12.3 are honored.

## 18. Phasing

| Phase | Includes | Goal |
|---|---|---|
| **v0.1 MVP** | `@composer/core`, `@composer/mcp`, `@composer/cli`, `@composer/typescript`, `@composer/adapter-kit`, `@composer/adapter-next`, `@composer/skill-claude`. CLI: `init / compose / validate / explain / trace / doctor`. Drift detection + source maps. | End-to-end via Claude Code on one reference Next.js project. |
| **v0.2** | `@composer/adapter-hono`, `@composer/adapter-postgres`. | Prove the methodology beyond pages (README §12 strongest cheap experiment). |
| **v1.0** | Migration codemods. `@composer/skill-codex`, `@composer/skill-gemini`. Constrained-decoding integration (Outlines / XGrammar / Anthropic structured outputs). Brownfield ingesters: `@composer/ingest-react`, `@composer/ingest-openapi`, `@composer/ingest-prisma`, `@composer/ingest-drizzle`. `composer ingest` and `composer promote` CLI. | Multi-agent support; brownfield adoption; invalid-by-construction JSON. |
| **Later** | `@composer/adapter-rust-axum`, `@composer/adapter-python-fastapi`. Daemon mode for incremental recompile. BNF/EBNF formal grammar export. **LSP** if human catalog/spec-authoring demand emerges. | Demand-driven expansion. |

## 19. Open questions (deferred — to revisit before v0.1 ships)

1. **Spec file path for ID collisions across adapters.** If `extends: @composer/adapter-next` reserves `design/specs/*.json` for pages, and a project also wants Hono endpoints, where do those specs live? Probably each adapter's `output.map.ts` declares a `specsDir` (e.g., `design/specs/pages/` for next, `design/specs/endpoints/` for hono). To be decided when `@composer/adapter-hono` is designed.
2. **`prep.ts` evaluation strategy.** Run prep in a Node `vm` context, in a child process, or via dynamic import? Sandboxing trade-offs vs. startup cost. To be decided during `@composer/core` implementation.
3. **Catalog hot-reload.** If a human edits `design/catalog/primitives/hero.ts` while an agent session is active, does the MCP server hot-reload, or require a restart? v0 probably restart; v1 hot-reload is daemon-mode work.
4. **MCP transport.** stdio only in v0.1, or also HTTP for remote-agent use cases? stdio is sufficient for local-attach; HTTP is a v1 question.
5. **Discoverable adapter registry.** No central registry in v0. A curated list in Composer docs is sufficient until ecosystem demand justifies more.

## 20. References

- `/Users/oner/Projects/composer/README.md` — Schema-Compiled Composition methodology (388 lines)
- `/Users/oner/Projects/sifir-ai/.sifir/` — existence proof, ~3,500 LOC Zod catalog, ~2,585 LOC codegen
- `/Users/oner/Projects/sifir-ai/docs/wiki/notes/2026-05-07-schema-compiled-composition-methodology.md` — canonical methodology note (Appendices A & B)
- External — see README §14 for prior art (Spec-Kit, Google A2UI, Airbnb Ghost Platform, LLM-Hardened DSL, DSL-Xpert, Outlines, XGrammar, llguidance, Dhall, CUE, KCL)
