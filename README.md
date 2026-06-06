# Composer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> A methodology and (eventually) a toolkit for **Schema-Compiled Composition (SCC)** — building software by letting LLMs author JSON against a typed grammar of hand-written primitives, then compiling that JSON to real source code.

**Status:** v0.1-alpha shipping. The toolkit implements the full methodology described below — agent-facing MCP tools, atomic compose pipeline, drift detection, custom-adapter `extends:`, source-map traversal. Polish phase in progress; `npm publish` pending.

---

## 0. Adopting Composer v0.1 (90-second quickstart)

In an empty Node.js / Next.js project:

```bash
# 1. Install the toolkit
npm install --save-dev @composer/cli @composer/adapter-next

# 2. Bootstrap the workspace + run one sample compose
npx composer init --extends @composer/adapter-next
```

After init you'll have:

```
composer.json              # { workspace: "./design", engine, extends }
design/
  catalog/                 # primitives (Hero, Page, Section, Card, CTA)
  templates/               # *.tsx.hbs per primitive
  output.map.ts            # primitive → output path
  specs/home.json          # the sample spec init seeded
src/app/home/page.tsx      # the file the sample compose emitted
```

Then attach an LLM agent that speaks MCP (Claude Code is the reference client):

```bash
# Install the skill pack
npm install --save-dev @composer/skill-claude
# Claude Code picks up @composer/skill-claude/SKILL.md + mcp.json automatically.
```

The agent now has four MCP tools (`discover`, `scaffold`, `validate`, `compose`) and **only** those four — no read/list/freeform-write escape hatches. Ask it to "compose a pricing page" and watch it call `discover → scaffold → compose`. The generated TSX lands in `src/app/<slug>/page.tsx`.

For human/CI use, the same operations are available as CLI commands:

```bash
composer compose <spec_id>      # human alternative to the MCP compose tool
composer validate <spec_id>     # dry-run preview
composer explain <file>:<line>  # which spec/primitive produced this line?
composer trace <spec_id>:<line> # where did this spec line emit code?
composer doctor                 # workspace health check (drift, sprawl, etc.)
composer doctor --fix           # remove reclaimable (stuck) compose locks
composer compose <spec> --force # force-break a stuck lock, then compose
```

A hung compose can never wedge the workspace: the lock self-heals (bounded compose +
age-based reclaim). See [docs/operations/compose-lock-and-limits.md](docs/operations/compose-lock-and-limits.md)
for the `maxComposeDurationMs` / `maxHoldMs` tunables and recovery.

### Backend & CommonJS hosts (NestJS, Express, plain Node)

Composer works in CommonJS host projects (a `package.json` **without** `"type": "module"`), not just ESM repos. Three things to know when instrumenting a backend:

- **Workspace stays ESM.** The `design/` workspace authors its modules (`catalog/index.ts`, `output.map.ts`, audit) as ES modules. `composer init` writes a `design/package.json` containing `{"type":"module"}` for you; if you hand-author the workspace, add that file yourself. (Without it, the TypeScript loader transpiles the workspace to CommonJS and the engine compensates — but the explicit `type:module` is the intended setup.)
- **Exclude the workspace from your app's TypeScript build.** The workspace authoring files are tooling, not application source. Add the workspace dir to your host `tsconfig` `exclude` (and `tsconfig.build.json` if you have one):

  ```jsonc
  { "exclude": ["node_modules", "dist", "design"] }
  ```

- **NestJS 11 + GraphQL** runs on Express 5, so Apollo needs the Express-5 integration package alongside the usual GraphQL deps:

  ```bash
  npm i @nestjs/graphql @nestjs/apollo @apollo/server graphql @as-integrations/express5
  ```

A worked example — a NestJS GraphQL API generated from Composer primitives for a simulated database and a simulated JWT guard — composes, builds, boots, and enforces auth end-to-end.

### Further reading

- **Methodology overview** (one-page): [`docs/methodology/scc-overview.md`](docs/methodology/scc-overview.md)
- **5-minute walkthrough**: [`specs/001-composer-toolkit-v0/quickstart.md`](specs/001-composer-toolkit-v0/quickstart.md)
- **Write a custom adapter** for a non-Next.js target: [`docs/adapters/authoring.md`](docs/adapters/authoring.md)
- **Ingest existing code** into the catalog (`ingest` → review → `promote`): [`docs/adapters/ingesting.md`](docs/adapters/ingesting.md)
- **Author a vocabulary** via guided interview (`grammar.*` → `promote`): [`docs/adapters/grammar-authoring.md`](docs/adapters/grammar-authoring.md)
- **What's deferred to v0.2**: [`docs/v0.2-deferrals.md`](docs/v0.2-deferrals.md)
- **Constitution** (engine rules): [`.specify/memory/constitution.md`](.specify/memory/constitution.md)

The rest of this README explains the **why** behind the design — read on if you want the architectural reasoning.

---

## Provenance

This README synthesizes:

- `sifir-ai/docs/wiki/notes/2026-05-07-schema-compiled-composition-methodology.md` (canonical methodology note, with Appendices A & B)
- The working `.sifir/` instance in `sifir-ai-customer-template-base` (the existence proof)
- Memory observations #1901, #1913, #4660, #5803, #6159, #6170, #6673, #7975, #7994, #8037, #8580 (CLI/registry schema-driven work)

---

## 1. The core idea (one paragraph)

Most software work is **rearrangement, not invention**. ~95% of any feature is standard patterns (validation, layout, persistence, auth, list/detail, forms); ~5% is novel logic. Today LLMs spend their cycles on the 95% and produce subtly broken results because they operate without constraint. Composer inverts this: **humans hand-write the 5% as versioned, typed primitives; LLMs do the 95% as JSON composition against those primitives; a deterministic codegen step lowers the JSON to real source files in the target ecosystem.** The LLM never writes code — only JSON conforming to a typed grammar. The grammar + composition rules + validators are the safety rail that makes LLM authorship stable.

This is the *Rails productivity leverage* of 2005, with the LLM filling the role the developer used to fill at the composition layer.

---

## 2. Why this works — the architectural bet

### The Three Surfaces

Every SCC system has exactly three surfaces, and one of them is the LLM's only writeable output:

| Surface | What it is | Who writes it |
|---|---|---|
| **Catalog** | Schema + metadata + template per primitive | Humans (maintainers) |
| **Composition** | JSON instances conforming to the catalog | **LLM (sole output)** |
| **Compiler** | Deterministic JSON → target code | Humans |

The LLM is **fenced into surface 2**. It never touches the runtime source tree, never touches the catalog, never touches the compiler. If a gap exists, the answer is *escalate to surface 1*, not work around it. Every escape hatch silently drifts runtime away from what JSON says.

### Primitives + Composition Rules (two-layer constraint)

- **Structural constraints** — what Zod can express: `z.literal`, `z.enum`, `.strict()`, nested arrays. Reject malformed JSON.
- **Semantic constraints** — what only `superRefine` / post-validation audits can express: "first child of Section cannot be Card", "≥50% of sections share an anchor width", "Hero must live inside a Section". Encode *taste*, *invariants*, *patterns from research*, and *escape hatches the LLM would otherwise discover*.

**The value isn't the Zod schema — it's the semantic layer.** Anyone can write a schema; the moat is "this composition is technically valid JSON but aesthetically broken" rules, derived from research and encoded as code the LLM can never violate.

### Compile, Don't Interpret

No runtime JSON renderer. The compiler reads JSON → validates → walks the tree → writes real source files at the destinations a hand-coded project would use.

Consequences:
- Output is **inspectable like any other source** — diffable, type-checked, lintable, debuggable.
- Generated code can use **full target-ecosystem power** (React Server Components, Edge runtime, Suspense, etc.) — a runtime interpreter would have to re-implement them.
- The **generator is the only bottleneck for new features**.
- A bijection check (JSON → code → JSON round-trip) catches drift at template build time.

---

## 3. Where it works, where it doesn't — the slider

```
Most JSON-friendly  ─────────────────────────────────  Most code-friendly
Configuration  Composition  Wiring/Workflow  Compound class  Algorithm
[trivial win]  [sweet spot] [proven]         [conditional]   [JSON loses]
```

| Position | Examples | Why |
|---|---|---|
| Configuration | `design.json`, tsconfig | No logic, bounded enums |
| **Composition (sweet spot)** | Page trees, UI catalogs | Finite primitives + composition rules + taste invariants |
| Wiring / orchestration | Terraform, XState, Temporal, OpenAPI, GitHub Actions, K8s manifests, Mongo aggregation, jq, GraphQL SDL, [Google A2UI](https://a2ui.org/) | Bounded operator vocabulary; behavior reduces to named effects |
| Compound class with declarative shape | Radix-style components, XState configs, ORM models | Class = *shape + named behaviors* |
| Class with rich runtime behavior | Parsers, custom hooks | JSON-encoding ≡ AST-encoding ≡ reinventing the language |
| General algorithm | Sorting, recursive descent | Unbounded vocabulary; JSON adds verbosity, no value |

### The diagnostic question

> *Is the LLM's value in choosing/composing primitives, or in inventing implementation?*

Former → JSONL surface. Latter → source code, called by name.

### The three-test heuristic — JSONify or keep as code?

Apply to any candidate domain. Pass all three → JSONify. Fail any → keep as code.

1. **Bounded vocabulary** — Can I enumerate the legal primitives in a list short enough for an LLM to hold in context (~50 max, comfortably 10–20)?
2. **Composition grammar** — Are there meaningful structural rules ("X must be inside Y") I can encode?
3. **Taste/invariant** — Are there aesthetic or correctness rules I want enforced once and always?

---

## 4. The primitive contract

Each primitive ships as a single record consumed by three different surfaces:

```ts
{
  primitive,        // discriminator literal
  schema,           // Zod — validation
  intent,           // prose — prompt + IDE
  whenToUse,        // prose — prompt + IDE
  whenNotToUse,     // prose — prompt + IDE  ← asymmetrically valuable
  fieldGuidance,    // per-field prose
  examples,         // canonical compositions
  template          // codegen lowering
}
```

**Validation, prompt construction, and IDE/docs all read from the same record.** The catalog *is* the API.

The `whenNotToUse` field is the asymmetric value: it stops the LLM from picking the wrong primitive when a less-correct option superficially fits. Far more valuable than most OpenAPI-style positive-only docs.

### The Slot Registry pattern

One declaration simultaneously defines the schema enum, tells codegen what to import/emit, and gives TypeScript the union type:

```ts
export const HERO_VARIANTS = {
  centered: { importPath: "...", exportName: "CenteredHero" },
  overlay:  { importPath: "...", exportName: "OverlayHero" },
} as const satisfies Record<string, SlotEntry>;
```

**Add a row → schema accepts it, codegen emits it, TS knows about it. Drift is structurally impossible.** Clone for any variant family in any future SCC system.

### The 30-line discipline test

> Can I write a primitive's template in **under 30 lines, with zero conditional logic beyond simple substitution**?

- Yes → real primitive.
- No → imperative function masquerading as a primitive. Decompose into smaller primitives, or admit it's library code that gets *called by name* from JSON.

This is the discipline that prevents primitive sprawl.

---

## 5. The three-layer architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Hand-written, version-stable, hard-tested                    │
│   • Primitives library (catalog)                             │
│   • Composition rules (superRefine + audits)                 │
│   • Codegen orchestrator (thin: read → validate → emit)      │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LLM-authored, throwaway, schema-validated                    │
│   • Feature specs (JSON)                                     │
│   • Each spec = composition of catalog primitives            │
│   • LLM never writes anything else                           │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Generated, boring, predictable                               │
│   • Real source files at real paths                          │
│   • Type-checked, lintable, debuggable                       │
│   • Source-mapped back to JSON specs                         │
└─────────────────────────────────────────────────────────────┘
```

Three layers, one owner type each (humans / LLMs / the build), one mutation surface each. The escape valve at every layer is *lift to the layer above*.

---

## 6. Generalizing beyond pages

```
Domain DSL = (Primitives × Composition Rules × Slot Registry) → Compiler → Target
```

| Domain | Primitives | Composition rule example | Compile target |
|---|---|---|---|
| Pages (proven) | Hero, Section, Card | "first child of Section cannot be Card" | Next.js TSX |
| Compound components | Field, Label, Trigger, Content | "Combobox.Content must be inside Combobox.Root" | React component file |
| API endpoints | Route, Handler, Middleware, RequestSchema | "every Route with `auth: required` must include `withAuth`" | Hono / Express / Fastify |
| DB schema | Table, Column, Index, ForeignKey, Policy | "every public table needs an RLS policy" | Postgres migration |
| Agent graphs | Node, Edge, Tool, Prompt | "no node may both call an LLM and write a tool in one step" | Agent runtime config |
| Workflows | Step, Branch, Trigger, Retry | "any Step calling an external API must declare a Retry" | Temporal / Step Functions |

The transferable engineering in each case:

1. Define the discriminated union of primitives.
2. Define the structural schema with Zod.
3. Define the semantic rules with `superRefine` and post-validation audits.
4. Build the slot registry that fuses enum + importer + emitter.
5. Write the compiler that walks JSON and emits target-language source.
6. Make the catalog (intent / whenToUse / whenNotToUse / examples) the *only* prompt the LLM sees about the domain.
7. Forbid escape hatches; every gap escalates to a catalog change.

---

## 7. The existence proof — `.sifir/` in sifir-ai

This isn't aspirational design. A working instance exists today:

- **`.sifir/catalog/*.ts`** — ~3,500 lines of Zod across `atoms.ts` (8 atoms), `layout.ts` (22 layout primitives), `forms.ts` (Form + 10 field types), `addons.ts`, `decorators.ts`, plus `slot-registry.ts`. `index.ts` aggregates into `PrimitiveNode = z.discriminatedUnion("primitive", [...])`.
- **`.sifir/pages/*.json`** — LLM output surface. Each is a `PageSchema`: `{ slug, title, navLabel, navOrder, navVisibility, metadata, tree: PrimitiveNode[] }`.
- **`.sifir/design.json` + `.sifir/layout.json`** — per-customer config (tokens, header/footer choice, social, address).
- **`scripts/codegen/run.ts`** (~2,585 lines, currently too thick — see §10 failure mode #2) — reads JSON, validates, emits `src/app/page.tsx`, `src/components/layout-frame.tsx`, `src/lib/forms/schemas.ts`, `src/styles/globals.css`, `src/app/sitemap.ts`.
- **`.sifir/guidelines.md`** — operational doctrine. §1 is titled *"Composition-only mandate: You compose. The codegen renders. There is no third option."*

The `Form` + 10 `*Field` primitives are the **runtime-behavior class existence proof** — validation, submission, error display, accessibility wiring, all defined as JSON, lowered to react-hook-form + Zod. Same recipe ports to API endpoints, DB tables, agent graphs, workflow steps.

---

## 8. Language-theory framing (Appendix A from source note)

Composer is, named precisely: a **total, declarative, JSON-hosted, LLM-targeted DSL** with a **context-free grammar** (Zod), a **context-sensitive static-semantics layer** (`superRefine`), and a **template-based compiler** emitting object code.

### JSON is the carrier, not the language

JSON is to Composer as the Latin alphabet is to French. JSON carries: GeoJSON, JSON-LD, OpenAPI, JsonLogic, JSON Resume, tsconfig, package.json — each a distinct language. **Calling Composer "a JSON dialect" undersells it. Calling it "a DSL hosted on JSON" connects it to 60 years of language-design literature.**

### The five language layers

| Layer | Standard name | Composer version |
|---|---|---|
| Carrier | Concrete syntax | JSON |
| Lexicon | Tokens | Legal `primitive` values |
| **Grammar** (well-formedness) | Context-free grammar | Zod discriminated union |
| **Static semantics** | Static analysis | `superRefine` + audits |
| **Semantics** (meaning) | Denotational / compilation | Codegen templates |
| Pragmatics | Style guide | `whenToUse` / `whenNotToUse` |

The two-layer validator split is **exactly the split every real compiler makes**: lexer → parser → semantic analyzer → IR → codegen. `superRefine` is the semantic pass. We built a real compiler without naming it.

### Two intentional design choices doing heavy lifting

**Declarative, not imperative — on purpose.** SQL says *what* data, not *how*. Terraform says *what* infrastructure, not *how*. Composer says *what* feature, not *how*. Declarative DSLs are the natural target for LLM generation because they remove imperative degrees of freedom — there is *one right way* to express any given intent.

**Not Turing-complete — on purpose.** SQL, Terraform, HTML, JSON Schema, CUE, Dhall — all deliberately not Turing-complete. The CS-theoretical name is **Total Functional Language**. Properties:
- **Decidable** — every spec terminates.
- **Analyzable** — static tools reason exhaustively.
- **Auditable** — a human reads any spec top-to-bottom and understands all behavior.
- **LLM-safe** — there is no infinite loop the LLM can produce.

The moment you add `{kind: "while", cond: ..., body: [...]}` you've crossed into Turing-completeness and lost all four. Push iteration into primitives with a fixed iteration model: `{kind: "forEach", over: "items", template: [...]}`.

### What this framing unlocks

Decades of solved problems become available:

- **Rust-quality error messages** — `superRefine` errors that say "Hero must be wrapped in a Section. Wrap as: Section { id: 'hero', children: [Hero{...}] }".
- **Source maps** — generated code → JSON spec line.
- **Incremental recompilation** — only rebuild specs whose JSON changed.
- **Language Server Protocol** — completion candidates from a verified catalog at every keystroke; LLM cannot hallucinate primitives that don't exist. **Highest-leverage tooling investment.**
- **Formal grammar specification** — BNF/EBNF; the Zod becomes derived implementation.
- **Refactoring tools** — "rename this primitive across all specs"; mechanical and safe.

> The catalog *is* the API. Our "API design" skills are now "language design" skills. The textbook is now Lisp, Smalltalk, Erlang pattern matching, Elm error messages, Rust type system.

---

## 9. Prior art landscape (Appendix B from source note)

Composer is **not novel in any individual component** — every piece exists in prior art. The distinctive combination is the contribution.

### Layered taxonomy

```
APPLICATION LAYER — domain instantiations
  Airbnb Ghost Platform (SDUI), Google A2UI, Lyft/Netflix/Uber SDUI,
  Spotify Hubs, Composer / .sifir (this work)

METHODOLOGY LAYER — named approaches
  GitHub Spec-Kit (prose-spec), LLM-Hardened DSL (Dean Mai, 2025),
  DSL-Xpert / DSL-Xpert 2.0 (academic), grammar prompting, Microsoft dsl-copilot

ENABLING LAYER — constrained generation tech
  Outlines (dottxt-ai), XGrammar / XGrammar-2 (vLLM, SGLang, TensorRT-LLM),
  llguidance (Microsoft, ~50µs/token Earley), Microsoft TypeChat,
  Anthropic Structured Outputs, OpenAI Structured Outputs

FOUNDATION LAYER — total declarative config languages
  CUE, Dhall, Pkl (Apple), KCL, Jsonnet, Nickel (Tweag),
  HCL (Terraform), Bazel Starlark
```

### Closest precedents

- **Google A2UI (Dec 2025)** — same catalog/composition pattern, but **runtime streaming** of UI rather than compile-time codegen. Composer's "compile, don't interpret" is the distinctive choice.
- **Airbnb Ghost Platform** — production-proven runtime version (Section + Screen + Action triad). GraphQL schema as source of truth, mirrors Composer's slot registry. Build-time vs runtime is the differentiator.
- **LLM-Hardened DSL (Dean Mai, May 2025)** — the closest *named methodology*. Mai's five principles (semantic anchoring, latent affordance encoding, counterfactual robustness, interactive executability, transparency in semantic provenance) map cleanly onto Composer.
  > *"The shape of a language's syntax and semantics can either absorb or reject probabilistic error introduced by LLM generation."* — Mai
  > **Adopt the term "LLM-Hardened DSL"** as the broader category; "Schema-Compiled Composition" as our specific architectural choice (compile-time, JSON-hosted, catalog-based).
- **GitHub Spec-Kit** — structured prose specs, complementary not competitive. Spec-Kit = *what* should be built; Composer = *how* to express the build. Mature workflow chains both: prose → LLM → SCC JSON → codegen → code.
- **DSL-Xpert (academic, 2024–25)** — formalizes "grammar prompting": feeding the DSL's vocabulary (BNF or JSON) into LLM context. Composer's catalog array *is* grammar prompting, by another name.

### What's distinctive about Composer

| Axis | A2UI | Airbnb GP | Spec-Kit | LLM-Hardened DSL | **Composer** |
|---|---|---|---|---|---|
| Carrier | JSON | GraphQL | Markdown | varies | JSON |
| Spec form | typed catalog | typed schema | structured prose | typed DSL | **typed catalog (Zod)** |
| Evaluation | runtime stream | runtime | LLM-time | varies | **build-time codegen** |
| Output | rendered UI | rendered UI | source code | source code | **source code** |
| Aesthetic invariants | no | no | implicit | not standardized | **yes (`superRefine`)** |
| Catalog model | yes | yes | no | varies | **yes** |
| Non-Turing-complete | yes | yes | n/a | yes | **yes** |
| Aesthetic-rules-from-research | no | no | no | no | **yes (research → `superRefine`)** |

The five distinctives: compile-time (vs runtime), typed grammar (vs prose), aesthetic invariants as static semantics, catalog-as-prompt-and-validator from one source, template-based codegen with the 30-line discipline.

---

## 10. Non-obvious failure modes — every team hits these

1. **Primitive sprawl.** Without discipline, every business case wants its own primitive. After a year: 500 primitives, no one knows which to pick, the LLM picks badly. AWS Construct Hub is the cautionary tale. Counter-pressure: a "consolidate-or-deprecate" review every release, and a hard rule that one-off primitives are not allowed — they must be either generic enough to reuse or composed from existing primitives.

2. **Composition vocabulary creep.** "Do A then B" → conditionals → loops → parallel → error handling → transactions → async/await. *At what point have you reinvented JavaScript with worse syntax?* Stay below ~10 control-flow constructs by pushing complex flow *into* primitives (`{kind: "withRetry", attempts: 3, body: [...]}` not explicit retry-loop syntax).

3. **Versioning the catalog.** A primitive's contract changes → every JSON spec using it potentially breaks. Need: semver on every primitive (the schema *is* the public API), migration codemods for JSON specs (not just code), catalog deprecation policy. CDK does this with V1 → V2 and people still hate it. Plan from day one.

4. **Debugging shifts to a mental-model problem.** When generated code breaks, the bug is in *one of three places*: JSON spec, primitive implementation, or codegen template. Stack trace points at the *generated code*, which is the one place the bug usually *isn't*. Need:
    - Source maps from generated code → JSON spec line
    - A `--why` mode in codegen explaining, for any output line, which JSON node + template produced it
    - Generated code with `// from: pages/index.json:42` comments on every emitted block
    
    **This is the single biggest reason teams abandon codegen architectures.** Friction at debugging time eats velocity at authoring time.

5. **State and effects don't compose like data does.** Pure primitives compose cleanly. Stateful primitives have lifecycles. Effectful primitives have idempotency / retry / transaction concerns. JSON composition expresses *what*, can't rescue broken *semantics*. Primitives must be **designed** for composition (referential transparency, explicit dependencies, predictable lifecycles), not just available for composition.

6. **The catalog becomes the velocity bottleneck.** New feature needs a new primitive → primitive PR → review → release → spec uses it. That cycle is the price. Fine for stable domains (customer sites — same patterns repeat). Painful for exploratory ones. Know which you're in.

---

## 11. The 95/5 leverage argument — why this can be a methodology, not just an internal tool

Most software work is rearrangement, not invention. A typical feature is 95% standard patterns and 5% novel logic. Today's LLM workflows have the ratio inverted — LLMs spend cycles inventing implementations of patterns that should be looked up. Composer aligns the workflow to the ratio:

- Humans write the 5% **once**, as primitives.
- LLMs do the 95% **every time**, as JSON composition.
- Codegen makes the boundary deterministic.

Same leverage that made Rails productive in 2005. The LLM fills the role the developer used to fill at the composition layer.

---

## 12. Roadmap — what makes Composer a "kit"

To extract from the sifir-ai instance into a reusable methodology, three artifacts beyond code:

1. **A primitive-design checklist** — when adding a new primitive: schema, semantic constraints, at least one `whenNotToUse`, at least one example, slot-registry entry if it has variants. Lift from `.sifir/guidelines.md §2.2` into a process doc.

2. **A compiler scaffold/template** — current `run.ts` is deeply Next.js-specific. The generalizable shell is small: `read JSON → Zod parse → for each top-level node, dispatch to emitter → write file → flush caches → audit pass`. Extract as ~150-line reusable scaffold.

3. **A "lifting prose to constraint" worksheet** — `superRefine` rules came from `docs/raw/research/2026-04-17-award-winning-layout-pattern-research.md`. Implicit workflow: read research → identify rule → quantify it → encode. **The most human-judgment-heavy part of the methodology and the one that most needs to be named.**

### Cheapest validation experiments

- **Apply to one non-page domain in the sifir-ai monorepo.** Strongest candidate: the `sifir-agent` agent graph. Already has nodes, edges, prompts, tools — natural primitives. Author one agent as JSON, write templates, generate the runnable agent file, run it. If it works for an agent graph (very different shape from page composition), the methodology is real and not page-specific. If it doesn't, you'll learn exactly which assumption breaks.
- **Extract `@composer/codegen-kit`** — even ~150 lines of "read+validate+walk+emit+audit" plumbing reused across domains is strong proof.
- **Integrate constrained decoding** against catalog schemas (Outlines / XGrammar / llguidance / native Anthropic structured outputs). Move from post-hoc Zod validation to decode-time grammar enforcement so invalid JSON becomes unrepresentable during generation.
- **Build a Language Server** for the catalog. Completion candidates from a verified catalog at every keystroke → LLM cannot hallucinate primitives. Highest-leverage tooling investment.
- **Publish a formal BNF/EBNF** of the grammar so the methodology can be consumed without reading 3,500 lines of Zod.

---

## 13. Vocabulary to adopt

Connecting the work to the broader literature:

- **LLM-Hardened DSL** (Dean Mai) — the broader methodological category Composer belongs to.
- **Schema-Compiled Composition (SCC)** — Composer's specific architectural choice.
- **Grammar prompting** — feeding the DSL's vocabulary into LLM context (what the catalog does).
- **Total Functional Language** — the CS-theoretical name for "every program terminates" (Coq, Agda, Idris, Dhall, CUE).
- **Static semantics** — the context-sensitive validation layer (what `superRefine` is).
- **Constrained decoding** — decode-time grammar enforcement (Outlines, XGrammar, llguidance).
- **Server-Driven UI (SDUI)** — runtime cousin of compile-time SCC (Airbnb, Lyft, Netflix).

---

## 14. Sources & cross-references

**Canonical methodology note** (read this first):
- `/Users/oner/Projects/sifir-ai/docs/wiki/notes/2026-05-07-schema-compiled-composition-methodology.md`

**The existence proof** (the working instance):
- `/Users/oner/Projects/sifir-ai/...` — `.sifir/catalog/`, `.sifir/pages/`, `scripts/codegen/run.ts`, `.sifir/guidelines.md`

**External literature** (selected):
- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [Google A2UI](https://a2ui.org/) — [v0.9 spec](https://a2ui.org/specification/v0.9-a2ui/)
- [Airbnb Ghost Platform deep dive](https://medium.com/airbnb-engineering/a-deep-dive-into-airbnbs-server-driven-ui-system-842244c5f5)
- [LLM-Hardened DSLs (Dean Mai)](https://deanm.ai/blog/2025/5/24/toward-data-driven-multi-model-enterprise-ai-7e545-sw6c2)
- [DSL-Xpert paper](https://victorjlamas.github.io/assets/papers/LLMXpertMODELS2024.pdf)
- [Outlines / constrained decoding overview](https://www.aidancooper.co.uk/constrained-decoding/)
- [XGrammar-2](https://blog.mlc.ai/2026/05/04/xgrammar-2-fast-customizable-structured-generation)
- [llguidance](https://github.com/guidance-ai/llguidance)
- [Awesome-LLM-Constrained-Decoding](https://github.com/Saibo-creator/Awesome-LLM-Constrained-Decoding)
- [Dhall](https://dhall-lang.org/) · [CUE / Holos](https://holos.run/blog/why-cue-for-configuration/) · [KCL](https://www.kcl-lang.io/)
