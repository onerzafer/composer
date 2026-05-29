# Feature Specification: Restrained brownfield ingestion (`ingest` + `promote`)

**Feature Branch**: `003-ingest-promote`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "A restrained tool that stays inside the Composer designed domain. `composer ingest` derives candidate primitives from existing code into a quarantine directory; a human reviews and `composer promote`s them into the live catalog. A `defineIngester` SDK pairs an ingester with its adapter (the encoder/decoder of one codec). Parsing is pluggable — the TypeScript compiler for TS sources, tree-sitter as a fallback for other languages. The agent is excluded from ingestion. React is the first ingester plugin."

**Origin**: Distilled from a design discussion + a Momus adversarial review (2026-05-29). The review concluded that *auto-growing the grammar* (meta-primitives, or grammar mutation during JSON authoring) is incompatible with SCC — it deletes Principle I and determinism. The constitution-clean version is **derive-may-be-automated, activation-requires-a-human**: exactly the quarantine-and-promote design already reserved in `001` (FR-022/FR-023) and `docs/superpowers/specs/2026-05-25-composer-design.md` §15. This feature builds that, plus a `defineIngester` SDK and a pluggable parser, with the human gate as the load-bearing invariant.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ingest an existing component and reuse it (Priority: P1)

A developer has a hand-written React component (or a directory of them) that predates Composer. They run `composer ingest react src/components/Card.tsx`. Composer derives a *candidate* primitive (a Zod schema from the component's prop types + a draft template) and writes it to a quarantine directory the engine ignores. The developer reviews the draft, fills in the semantic metadata an auto-derivation can't infer (`whenToUse`, `whenNotToUse`, semantic rules), then runs `composer promote` to move it into the live catalog. From then on the primitive is composable — and referenceable inline from a page spec — exactly like a hand-authored one.

**Why this priority**: This is the end-to-end value: "I built a component once; make it a reusable primitive." It is the brownfield adoption path that lets existing codebases enter SCC incrementally instead of rewriting their catalog by hand.

**Independent Test**: Point `composer ingest react` at a sample component; assert a draft lands in quarantine and is invisible to `discover`/`compose`; `promote` it; assert it then appears in the catalog and a spec referencing it composes to source.

**Acceptance Scenarios**:

1. **Given** an existing React component with typed props, **When** the developer runs `composer ingest react <file>`, **Then** a candidate primitive (schema + draft template + metadata stub) is written to the quarantine directory, and nothing in the live catalog, `discover`, or `compose` changes.
2. **Given** a quarantined draft, **When** the developer runs `composer promote <draft>`, **Then** the primitive moves into the live catalog and becomes available to `discover`/`scaffold`/`compose`.
3. **Given** a promoted primitive, **When** an agent or human composes a spec that uses it (including as an inline/slot child of a page), **Then** the engine emits source for it like any other primitive.
4. **Given** any ingest run, **When** it completes, **Then** no agent-facing surface (MCP) was involved and no live-catalog state changed — only quarantine files were written.

---

### User Story 2 — Author a custom ingester via the SDK (Priority: P2)

An adapter author maintains `@acme/composer-adapter-foo` (the forward path: JSON → Foo-framework code). Using a `defineIngester` SDK, they add the reverse path in the same package: a codec that reads Foo source and emits candidate primitives. The ingester and adapter share one notion of the primitive set, so the round-trip (bijection) is meaningful and testable.

**Why this priority**: Ingestion is framework-specific by nature (an ingester is the inverse of an adapter's templates). Making it a first-class SDK surface — symmetric with `defineAdapter` — keeps ownership where the constitution wants it (humans/adapter authors) and lets the ecosystem add ingesters without forking the engine.

**Independent Test**: Author a minimal ingester for the test "keyvalue" adapter via the SDK; ingest a sample source file; assert the derived primitive round-trips (ingest → compose → ingest yields the same JSON).

**Acceptance Scenarios**:

1. **Given** the `defineIngester` SDK, **When** an author implements an ingester for their adapter, **Then** it plugs into `composer ingest <plugin>` without engine changes.
2. **Given** a paired adapter+ingester, **When** the bijection check runs, **Then** ingesting a component, composing the resulting JSON, and re-ingesting the output yields the same JSON.

---

### User Story 3 — Ingest from a non-TypeScript source (Priority: P3)

A developer wants to ingest from a source that isn't TypeScript (e.g. a SQL schema or an OpenAPI document). The ingester for that ecosystem uses a tree-sitter (or format-native) parser backend instead of the TypeScript compiler, through the same pluggable parse layer.

**Why this priority**: Proves the parser abstraction is real and that TypeScript isn't hard-wired — without forcing every ingester onto one parser. It is lower priority because the primary, highest-value targets are TS frameworks.

**Independent Test**: Implement (or stub) a non-TS ingester using the tree-sitter backend; ingest a sample source; assert a draft is produced via the alternate parser.

**Acceptance Scenarios**:

1. **Given** a non-TS source, **When** its ingester declares a tree-sitter (or native) parser backend via the SDK, **Then** `composer ingest` uses that backend rather than the TypeScript compiler.

---

### Edge Cases

- **Quarantine is inert.** Drafts in the quarantine directory MUST NOT affect the live catalog, `discover` output, or `compose` — ever — until promoted. (The loader already structurally ignores `catalog/ingested/` per `001` FR-023.)
- **Promote conflict.** Promoting a draft whose primitive name collides with an existing catalog primitive MUST stop with a clear message (no silent overwrite); the human resolves the conflict.
- **30-line discipline.** A derived template that exceeds the 30-line discipline (Constitution V) MUST be flagged (via `composer doctor`) rather than silently promoted; complex components surface as "needs decomposition," not as oversized primitives.
- **Type resolution required.** For TypeScript sources, prop/contract extraction MUST resolve types (interfaces, imports, generics, utility types like `Omit`/`Pick`) — a syntax-only parse is insufficient. The parser backend for TS MUST be type-aware.
- **Missing/implicit contract.** A component with untyped or `any` props MUST produce a draft with the unknowns explicitly marked for human completion, not a silently empty or `any` schema.
- **Catalog sprawl / token budget.** Because promotion is deliberate and human-gated, catalog growth stays human-controlled; `doctor`'s primitive-sprawl report continues to surface growth. Ingestion MUST NOT auto-promote to avoid uncontrolled `discover`-context inflation.
- **Agent attempts to ingest.** There is no MCP/agent surface for `ingest` or `promote`; an agent cannot trigger either.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a CLI command `composer ingest <plugin> <source>` that derives one or more *candidate* primitives (Zod schema + draft template + metadata stub) from existing source and writes them ONLY to the engine-ignored quarantine directory (`design/catalog/ingested/`).
- **FR-002**: The system MUST provide a CLI command `composer promote <draft>` that moves a reviewed draft from quarantine into the live catalog; this is the ONLY operation that adds an ingested primitive to the active grammar.
- **FR-003** (the gate — non-negotiable): Nothing — ingestion, the SDK, or the agent — MUST change what `discover`/`scaffold`/`validate`/`compose` accept without a human running `promote`. Derivation may be automated; **activation requires a human**.
- **FR-004**: `ingest` and `promote` MUST be CLI-only. They MUST NOT be exposed on the MCP/agent surface (Constitution IV). The agent cannot trigger derivation or activation in v1.
- **FR-005**: The system MUST provide a `defineIngester` SDK (sibling to `defineAdapter`) so an adapter author can ship the reverse codec in the same package as the forward adapter, sharing one primitive-set definition.
- **FR-006**: The parse layer MUST be pluggable per ingester. The default backend for TypeScript sources MUST be type-aware (TypeScript compiler / equivalent); ingesters MAY declare an alternate backend (e.g. tree-sitter or a format-native parser) for non-TS sources.
- **FR-007**: `promote` MUST refuse to overwrite an existing live primitive of the same name; conflicts stop with a clear, actionable message.
- **FR-008**: Promoted primitives MUST be indistinguishable from hand-authored ones — composable, referenceable inline/slot, and subject to the same validation, drift, and bijection rules.
- **FR-009**: The bijection check MUST cover ingester correctness: for a paired adapter+ingester, ingest → compose → re-ingest MUST round-trip the JSON.
- **FR-010**: `composer doctor` MUST flag a derived/promoted template that violates the 30-line discipline (Constitution V) so oversized derivations are surfaced, not silently accepted.

### Key Entities

- **Ingester**: A framework-specific codec (the inverse of an adapter's templates) authored via `defineIngester`. Reads source through a parser backend; emits candidate primitives. Lives with its adapter.
- **Parser backend**: A pluggable component that turns source text into an analyzable tree. Type-aware (TS compiler) for TypeScript; tree-sitter or format-native for other languages.
- **Candidate primitive (draft)**: A quarantined, inert schema + draft template + metadata stub awaiting human review. Not part of the catalog.
- **Quarantine directory**: `design/catalog/ingested/` — engine-ignored (per `001` FR-023); the only place `ingest` writes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can ingest a real React component and, after a single review+promote, compose a spec that uses the resulting primitive to emit working source — with no hand-editing of generated code.
- **SC-002**: Before promotion, an ingested draft has zero effect: `discover`, `scaffold`, and `compose` behave identically with and without drafts present in quarantine (verified in an automated test).
- **SC-003**: For at least one paired adapter+ingester, the bijection round-trip (ingest → compose → re-ingest) reproduces the JSON, asserted in CI.
- **SC-004**: There is no code path — CLI or MCP — by which an agent activates a primitive; activation is reachable only via a human-run `promote` (verified by the absence of an MCP ingest/promote tool and a test asserting the agent surface is unchanged).
- **SC-005**: A second ingester (for a different framework/language) can be authored against the SDK without modifying the engine, demonstrating the parse layer and SDK are genuinely pluggable.

## Assumptions

- This feature operationalizes the v1.x ingestion already reserved by `001` (FR-022/FR-023) and designed in `docs/superpowers/specs/2026-05-25-composer-design.md` §15; the quarantine directory is already engine-ignored, so no loader change is needed to keep drafts inert.
- The **agent-proposes-to-quarantine** capability (an agent emitting a draft, never activating it) is explicitly **out of scope for v1** — kept CLI/human-only for the cleanest line; it can be reconsidered later behind an off-by-default flag.
- React (`.tsx` prop-types → primitive) is the first ingester plugin; its parser backend is the TypeScript compiler. Other ecosystems (OpenAPI, Prisma, SQL) are future plugins and out of scope here beyond proving the parser is pluggable (US3).
- "Generic code→AST in the CLI" is realized as a *pluggable parse interface*, not a single universal parser: a syntax-only tree (tree-sitter) is insufficient for the TS contract-extraction core, which requires type resolution. The generic, shared layer is the orchestration (`ingest`/`promote` flow, quarantine, draft format, bijection harness, `defineIngester` contract) — not the parser itself.
- Depends on the `001` engine (this branch is cut from the current line); it composes on top of, not instead of, the existing catalog/adapter model.
