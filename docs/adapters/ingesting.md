# Ingesting Existing Code

Composer's **ingestion** path lets a brownfield codebase adopt Schema-Compiled
Composition incrementally — without hand-rewriting its catalog. You point a
framework-specific *ingester* at existing source; it derives a *candidate
primitive* (a Zod schema + a draft template + a metadata stub) into a quarantine
directory the engine ignores. A human reviews the draft, fills in the semantic
metadata an auto-derivation can't infer, and **promotes** it into the live
catalog. From then on it composes like any hand-authored primitive.

The load-bearing rule: **derivation may be automated; activation requires a
human.** There is no agent (MCP) surface for `ingest` or `promote` — both are
CLI-only (constitution IV).

---

## The loop

```bash
# 1. Derive a candidate primitive from existing source (CLI-only).
composer ingest react src/components/Card.tsx
#    → writes design/catalog/ingested/Card.draft.ts (+ Card.draft.tsx.hbs).
#    → the engine IGNORES catalog/ingested/, so discover / scaffold / compose
#      are byte-identical to having no draft at all (SC-002 inertness).

# 2. Review the draft. Fill in intent / whenToUse / whenNotToUse / semantic
#    rules, and replace any `z.unknown()` fallbacks the derivation couldn't
#    resolve. This human review IS the gate.

# 3. Promote it into the live catalog.
composer promote Card
#    → moves Card.draft.ts   → design/catalog/primitives/card.ts
#            Card.draft.tsx.hbs → design/templates/card.tsx.hbs
#    → refuses to overwrite an existing primitive of the same name (FR-007).

# 4. Use it — compose a spec that references the now-live primitive.
composer compose home
```

`composer doctor` flags an oversized derived template (the 30-line discipline)
so a complex component surfaces as **needs decomposition** here rather than being
promoted as an oversized primitive (FR-010). The check covers both live
templates and quarantined drafts.

---

## Authoring an ingester via `defineIngester`

An ingester is the **inverse codec** of an adapter's templates:

| Direction | Who | Operation |
|---|---|---|
| forward (adapter) | `defineAdapter` | JSON spec → code (`compose`, via templates) |
| reverse (ingester) | `defineIngester` | code → primitive (`ingest` / `decode`) |

Co-locate the ingester with its adapter, in the same package, sharing one
primitive-set definition. That co-location is what makes the **bijection**
round-trip meaningful and testable (next section).

`defineIngester` (from `@composer/ingest-kit`) is the symmetric sibling of
`defineAdapter`. The codec is three pieces:

```ts
import {
  defineIngester,
  typescriptBackend,
  type CandidateDraft,
  type ParsedSource,
  type TsParsedSource,
} from "@composer/ingest-kit";

export default defineIngester({
  name: "react",

  // 1. backend — the pluggable parser. Type-aware (the TS compiler) for TS
  //    sources; a format-native backend (keyvalueBackend, or a tree-sitter
  //    backend) for other languages. The shared layer is the orchestration,
  //    NOT the parser.
  backend: typescriptBackend,

  // 2. extract — parsed source → candidate primitive DRAFTS (schema + template
  //    + metadata stub). This is what `composer ingest` writes to quarantine.
  extract(parsed: ParsedSource<TsParsedSource>): CandidateDraft[] {
    const { checker, sourceFile } = parsed.tree;
    /* …derive a Zod schema from the component's prop types… */
    return [draft];
  },

  // 3. decode — OPTIONAL. parsed source → JSON spec INSTANCE(s): the true
  //    inverse of `compose`. Implement it when the ingester is paired with an
  //    adapter so the bijection check (below) can round-trip the JSON.
  decode(parsed: ParsedSource<TsParsedSource>) {
    /* …recover a spec node from the source… */
    return [node];
  },
});
```

`defineIngester` synthesizes the `ingest()` entrypoint the CLI calls
(`backend.parse` → `extract`), so the plugin stays a pure declaration. The CLI
resolves your ingester by package name: `composer ingest <plugin> <source>`
loads `@composer/ingest-<plugin>` from the project's `node_modules`.

`extract` derives the *grammar* (a schema). `decode` recovers an *instance*. An
ingester needs `extract` to participate in `composer ingest`; it adds `decode`
only to participate in the bijection harness.

### The parse layer is pluggable

The default backend for TypeScript sources is **type-aware** — deriving a Zod
schema from a component's contract requires resolving interfaces, imports,
generics, and utility types like `Omit`/`Pick`, which a syntax-only tree can't
do. For non-TS sources, declare an alternate backend behind the same
`ParserBackend` interface. `@composer/ingest-kit` ships:

| Backend | For | Resolves types? |
|---|---|---|
| `typescriptBackend` | `.ts` / `.tsx` (React, NestJS, Drizzle, …) | yes (TS compiler + checker) |
| `keyvalueBackend` | flat `.env`-style `KEY=value` | n/a — structure is the contract |

A tree-sitter backend slots in the same way for richer non-TS grammars. The
engine never changes to add a parser — that's the whole point of the abstraction
(SC-005).

---

## The bijection check

For a **paired adapter + ingester**, ingest → compose → re-ingest must round-trip
the JSON (FR-009 / SC-003):

```text
source code ──decode──▶ JSON ──compose──▶ generated code ──decode──▶ JSON
                         └────────────── must be equal ──────────────┘
```

Because the ingester is the inverse of *that specific adapter's* templates, the
round-trip is a precise correctness test for the codec. See
`tests/contract/ingest-bijection.test.ts` for the keyvalue pairing, and
`tests/fixtures/ingest-keyvalue/index.ts` for a ~70-LOC ingester authored
entirely against the SDK (a non-TS source, the format-native backend, zero
engine changes).

---

## What stays out of reach (v1)

- **The agent cannot ingest or promote.** No MCP tool exists for either; the
  agent's action space is human-fixed (constitution IV / SC-004).
- **No auto-promote.** Catalog growth stays human-gated, which keeps the
  `discover` context budget under deliberate control.
- **Agent-proposes-to-quarantine** (an agent emitting a draft it can never
  activate) is deferred behind a future off-by-default flag — not built now.

---

## Further reading

- Adapter authoring (the forward codec): `docs/adapters/authoring.md`
- Constitution: `.specify/memory/constitution.md`
- Reference design §15 (adoption paths): `docs/superpowers/specs/2026-05-25-composer-design.md`
- Feature spec: `specs/003-ingest-promote/spec.md`
