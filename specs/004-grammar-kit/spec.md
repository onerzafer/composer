# Feature Specification: Grammar-kit — guided, human-owned vocabulary authoring

**Feature Branch**: `004-grammar-kit`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "A guided, AI-assisted, human-owned authoring workflow for Composer's grammar/catalog (the primitive vocabulary), mirroring spec-kit's structure applied one level down. Phases: grammar.specify (intent → vocabulary brief), grammar.clarify (an interactive, recommend-first ≤5-question interview eliciting primitive boundaries, props, composition rules, output mapping, naming, decomposition points — the centerpiece), grammar.plan (catalog design), grammar.tasks (per-primitive authoring tasks), grammar.author (AI drafts Zod schema + template into staging for human review/accept — never auto-activates), grammar.checklist/analyze (bijection, 30-line, whenNotToUse + examples, no control-flow primitives). Hard constraints: human owns/accepts the grammar (same gate as 003); authoring-time CLI, not agent/MCP surface; steer toward 30-line decomposition and away from control-flow primitives."

**Origin**: A field-research analogy (2026-05-29) observed that Composer is spec-kit's "spec-driven" philosophy applied one level down — JSON composes against a human-owned **grammar** the way code is built against a human-owned **spec**. Composer ships the *runtime* skills (`discover`/`scaffold`/`validate`/`compose`) but has **no guided authoring workflow for the grammar itself**; authoring the catalog today is unguided manual TS/Zod work. This feature closes that gap and is the constitution-clean way to "extend the vocabulary" — the AI *interviews and drafts*, the human *decides and owns*, then the existing compose runtime is used unchanged. It is the forward (intent → grammar) complement to `003`'s reverse (existing code → grammar) authoring assist; both feed the human-owned catalog through one human accept gate.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Author a primitive via a guided interview (Priority: P1)

A developer wants Composer to generate code for a target that has no ready-made vocabulary (or wants to add a primitive). Instead of hand-writing schemas and templates blind, they describe their intent in plain language and the tool runs a short, recommend-first **interview** that elicits the decisions only a human can make — what the primitive is, its props/fields, how it composes with others, where its output goes, and where to decompose to stay simple. The tool then **drafts** the grammar (schema + template + metadata) into a staging area. The developer reviews, edits, and **accepts** it; from then on it is a normal catalog primitive that composes like any other.

**Why this priority**: This is the core value and the centerpiece (the interview). Composer's whole bet is "95% JSON rides on a 5% human-authored grammar" — and that 5% is currently the only *unassisted* part. Making it guided is the largest lever on adoption.

**Independent Test**: Give the tool an intent for a single primitive; complete the interview; confirm a draft lands in staging (invisible to compose), then accept it and confirm a spec using it composes to source — with no from-scratch hand-authoring of the schema/template.

**Acceptance Scenarios**:

1. **Given** a plain-language intent, **When** the developer runs the guided authoring workflow, **Then** an interactive interview asks at most a small number of high-impact, recommend-first questions and records the answers into a vocabulary brief.
2. **Given** a completed brief, **When** the tool drafts the grammar, **Then** the schema + template + metadata are written ONLY to a staging area and have zero effect on the live catalog, `discover`, `scaffold`, or `compose`.
3. **Given** a staged draft, **When** the developer explicitly accepts it, **Then** it moves into the live catalog and becomes composable (and referenceable as a child of other primitives).
4. **Given** any authoring run, **When** it completes, **Then** no agent/MCP surface was involved and nothing entered the live catalog without an explicit human accept.

---

### User Story 2 — Verify grammar quality before accepting (Priority: P2)

Before a human accepts a drafted (or hand-written) primitive, they get an automated quality report so they can accept with confidence rather than discovering problems at compose time.

**Why this priority**: The accept gate is only as good as the human's ability to judge the draft. A quality report turns "looks fine" into checkable guarantees, and it is what keeps auto-derivation honest.

**Independent Test**: Run the quality gate against a drafted primitive; confirm it reports pass/fail on each criterion and blocks/flags drafts that fail.

**Acceptance Scenarios**:

1. **Given** a drafted primitive, **When** the quality gate runs, **Then** it reports on: round-trip stability (a composed instance can be read back to the same data), the 30-line discipline, presence of `whenNotToUse` + at least one example, coherence between the schema/template/output-mapping/metadata, and absence of any control-flow primitive.
2. **Given** a draft whose template exceeds the 30-line discipline, **When** the gate runs, **Then** it flags the primitive as "needs decomposition" rather than passing it.

---

### User Story 3 — Extend an existing vocabulary incrementally (Priority: P3)

A developer adds a new primitive to a catalog that already has several, and the workflow keeps the addition consistent with what's there (no name collisions, sensible slot/composition fit) instead of treating it as a greenfield grammar.

**Why this priority**: Most real authoring is incremental enhancement of an existing catalog, not greenfield. Lower priority because the greenfield interview (US1) is the foundation it builds on.

**Independent Test**: With an existing catalog, author one additional primitive; confirm the workflow surfaces existing primitives for context and refuses a name collision on accept.

**Acceptance Scenarios**:

1. **Given** a catalog with existing primitives, **When** the developer authors a new one, **Then** the interview is informed by the existing vocabulary (it can suggest reuse / flag overlap) and accept refuses a name collision with a clear message.

---

### Edge Cases

- **Staging is inert.** Drafts MUST NOT affect the live catalog, `discover`, `scaffold`, or `compose` until accepted (mirrors the `003` quarantine + the engine-ignored `catalog/ingested/` mechanism).
- **Oversized template.** A drafted template exceeding the 30-line discipline MUST be flagged for decomposition, never silently accepted.
- **Control-flow-shaped request.** If the interview surfaces a primitive that wants conditionals/loops, the workflow MUST steer it toward a declarative encoding (e.g., a fixed `forEach`-style primitive) rather than admit control flow (Constitution VIII).
- **Name collision on accept.** Accepting a draft whose name already exists in the live catalog MUST stop with a clear message; the human resolves it.
- **Skipped interview.** A developer MAY skip clarification for an exploratory spike, but MUST be warned that downstream rework risk increases (mirrors spec-kit's clarify behavior).
- **Undecidable answer.** If the human cannot resolve an interview question, it is marked and deferred rather than guessed silently.
- **Constitution conflict.** A drafted primitive that would violate a MUST principle MUST be flagged as a blocking issue before accept.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a guided, multi-phase authoring workflow for the grammar (intent → brief → clarify → design → author → quality-check), runnable at authoring time.
- **FR-002**: The clarify phase MUST run an interactive, recommend-first interview that asks a small number (≤5 per round) of high-impact questions eliciting primitive boundaries, fields/props, composition rules, output mapping, naming, and decomposition points; each question offers a recommended answer the human can accept or override.
- **FR-003**: The author phase MUST write drafted grammar (schema + template + metadata) ONLY to a staging area that the engine ignores; drafting MUST NOT change the live catalog.
- **FR-004** (the gate — non-negotiable): A drafted primitive MUST enter the live catalog ONLY via an explicit human **accept**; nothing the AI produces activates without it. (Same human gate as `003` `promote`.)
- **FR-005**: The workflow MUST be authoring-time tooling (CLI/human). It MUST NOT add any agent/MCP surface (Constitution IV); the agent's tool set is unchanged.
- **FR-006**: The workflow MUST steer authored grammar toward the 30-line discipline (flag/decompose oversized templates) and away from control-flow primitives (Constitution VIII); drafts violating either MUST be flagged before accept.
- **FR-007**: The system MUST provide a pre-accept quality report covering: round-trip (bijection) stability, the 30-line discipline, presence of `whenNotToUse` + ≥1 example, coherence across schema/template/output-mapping/metadata, and absence of control-flow primitives. (May reuse/extend `composer doctor`.)
- **FR-008**: The workflow MUST treat the SCC constitution as the authority; it MUST NOT produce or accept a primitive that violates a MUST principle.
- **FR-009**: Accepted primitives MUST be indistinguishable from hand-authored ones — composable, referenceable as children, subject to the same validation/drift/bijection rules — and usable by the existing compose runtime with no further steps.
- **FR-010**: The feature MUST complement `003` (reverse, code→grammar) by sharing the same staging + human-accept gate, so forward (intent→grammar) and reverse authoring assists converge on one human-owned catalog.

### Key Entities

- **Vocabulary brief**: the structured output of specify+clarify — candidate primitives, intents, composition shape, slots, output paths, and the human's recorded decisions.
- **Primitive draft**: a staged, inert schema + template + metadata awaiting human review; not part of the catalog.
- **Staging area**: the engine-ignored location drafts live in until accepted (the `003`/`catalog/ingested/` mechanism).
- **Accept gate**: the explicit human action that moves a draft into the live catalog — the single point where the grammar changes.
- **Quality report**: the pre-accept pass/fail across bijection, 30-line, metadata completeness, coherence, and total-functional checks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer who has never hand-authored a Composer primitive can stand up a working one (intent → interview → accept → `compose` emits source) without writing the schema/template from scratch.
- **SC-002**: 100% of accepted primitives pass the quality gate (bijection, 30-line, metadata completeness, no control-flow); nothing that fails the gate can be accepted without an explicit override decision.
- **SC-003**: With drafts present in staging, `discover`, `scaffold`, and `compose` behave identically to no-drafts (staging is inert) — verified in an automated test.
- **SC-004**: There is no agent/MCP path to author or accept grammar; the agent's tool surface is unchanged (verified by the absence of any new MCP tool).
- **SC-005**: The interview resolves the high-impact authoring decisions in ≤5 questions per round and yields a brief a human can review in a single sitting.

## Assumptions

- This is meta-tooling for Composer adopters / adapter authors, layered on the `001` engine; it does not change the runtime composition path.
- The guidance engine can reuse spec-kit's own pattern (path-resolving scripts, per-artifact templates, the constitution-as-authority, review gates, and the recommend-first ≤5-question interview loop); only the **taxonomy and templates** are Composer-specific (primitive boundaries, slot rules, 30-line decomposition, total-functional check).
- `composer doctor` already covers much of the quality gate (drift, sprawl, 30-line, naming, and bijection-in-CI); `grammar.checklist`/`analyze` extends/reuses it rather than duplicating it.
- The accept gate is the same human gate as `003` `promote`; the two features share the staging + accept mechanism (one is intent→grammar, the other code→grammar).
- The centerpiece first deliverable is the clarify interview, where the human-guidance value concentrates; the other phases (specify/plan/tasks/author/checklist) can land incrementally around it.
- Catalog authoring stays TypeScript/Zod (Constitution IX): the AI drafts TS, the human owns and accepts it.
- This feature does NOT introduce auto-grow / compose-time grammar mutation / meta-primitives (explicitly rejected in the `003` research); all grammar change remains gated behind a human accept.
