# Research: Restrained brownfield ingestion

Phase 0 output. No open `NEEDS CLARIFICATION` — the design was settled in a 2026-05-29 discussion + Momus adversarial review. This records the decisions and, importantly, the alternatives deliberately rejected.

## Decision 1 — Derive-may-be-automated, activation-requires-a-human (the gate)

- **Decision**: `ingest` writes only to the engine-ignored quarantine; `promote` is the sole operation that changes the live catalog, and it is a human CLI action.
- **Rationale**: Momus's review showed that letting the grammar change without a human gate breaks the load-bearing invariants — determinism (compose becomes order-dependent), the bijection/total-functional guarantees (the language stops being fixed/first-order), drift detection (spec→code mapping stops being stable), the "small/stable 5%" bet, and agent-capability boundedness (the agent would self-expand its own action space). The gate is not bureaucracy; it is the wall those guarantees rest on.
- **Alternatives rejected**:
  - *Auto-grow the grammar during JSON authoring* — violates Constitution I (the LLM would author schema+template = code), II, III (compose would mutate the catalog), IV, and determinism. **No bounded version exists** — any bound IS the promote-gate.
  - *Meta-primitives that emit live catalog entries* — violates II/VIII/X (self-referential, higher-order grammar). Acceptable only if downgraded to "synthesize TypeScript into quarantine for human review," which is just ingestion wearing a different hat.

## Decision 2 — `defineIngester` SDK, paired with the adapter

- **Decision**: Ship a `defineIngester` SDK (sibling of `defineAdapter`). An ingester is authored in the same package as its adapter, sharing one primitive-set definition.
- **Rationale**: An ingester is the *inverse codec* of an adapter's templates (forward: JSON→code; reverse: code→primitive). Co-locating them makes the bijection round-trip natural and testable, keeps ownership with the human adapter author (Constitution VII), and lets the ecosystem add ingesters without forking the engine.
- **Alternatives rejected**: a monolithic in-engine ingester (couples the engine to every framework); an LLM-based generic extractor (non-deterministic, un-round-trippable — antithetical to SCC).

## Decision 3 — Pluggable, type-aware parse layer (NOT tree-sitter as the sole generic layer)

- **Decision**: The parse layer is a pluggable interface. The default backend for TypeScript sources is **type-aware** (TS compiler / `ts-morph`). Ingesters MAY declare an alternate backend (tree-sitter or a format-native parser) for non-TS sources. The generic/shared layer is the *orchestration*, not the parser.
- **Rationale**: A proposal to make the CLI ship a single generic `tree-sitter` code→AST converter under-serves the hard part of ingestion. tree-sitter yields a **concrete syntax tree** (good for structural traversal) but **no type information**. The core of ingestion — deriving the Zod schema from a component's contract — requires resolving types (interfaces, imports, generics, `Omit`/`Pick`), i.e. the type checker. For the dominant target (TS frameworks, and Composer's own authoring language), tree-sitter is a downgrade; the ecosystem already extracts React prop types via the TS compiler (`react-docgen-typescript`), not a CST. So: keep the user's instinct (generic machinery in the CLI, framework codec in an SDK) but make the parser pluggable and default to the type-aware tool per language.
- **Alternatives rejected**: tree-sitter as *the* universal parser (wrong layer for the semantic core); hard-wiring the TS compiler for all languages (blocks non-TS plugins). Tree-sitter remains a first-class *backend option* for languages lacking a rich first-party AST.
- **YAGNI note**: build `ingest-react` against the TS compiler first; introduce the tree-sitter backend only when the second, non-TS plugin (US3) actually needs it — then extract the parser interface from two real consumers rather than guessing it from one.

## Decision 4 — Agent excluded from ingestion in v1

- **Decision**: No MCP/agent surface for `ingest`/`promote`. CLI/human only.
- **Rationale**: Constitution IV — the agent's action space must stay human-fixed. Even an "agent proposes a draft into quarantine" capability gives the agent a write surface it lacks today; deferred behind a future off-by-default flag, not built now.

## Decision 5 — Bijection check covers ingester correctness

- **Decision**: Reuse the bijection harness so a paired adapter+ingester round-trips (ingest → compose → re-ingest ⇒ same JSON).
- **Rationale**: This is the natural correctness test for the codec and is already anticipated by the existing design (§15.5). It only has meaning because the ingester is the inverse of a *specific* adapter — further confirming why ingesters are framework-specific.
