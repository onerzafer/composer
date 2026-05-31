---
description: "Task list for 003-ingest-promote"
---

# Tasks: Restrained brownfield ingestion (`ingest` + `promote`)

**Input**: Design documents from `/specs/003-ingest-promote/`

**Prerequisites**: plan.md, spec.md (present); research.md, quickstart.md (present)

**Tests**: REQUIRED — inertness, promote, and bijection are spec success criteria (SC-002/SC-003/SC-004) and constitution Quality Gates. Write tests RED before implementation.

**Organization**: Grouped by user story (US1 P1 ingest→promote→reuse; US2 P2 SDK; US3 P3 non-TS parser). The human-gate invariant (FR-003) is cross-cutting and asserted in tests.

---

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no incomplete-dependency)
- **[Story]**: US1 / US2 / US3
- All paths repository-relative

---

## Phase 1: Setup & Foundational

- [X] T001 Scaffold `packages/ingest-kit/` (package.json, tsconfig, src/index.ts) — the SDK + shared orchestration types.
- [X] T002 [P] Scaffold `packages/ingest-react/` (package.json depending on ingest-kit + a type-aware TS analysis lib).
- [X] T003 Define the draft/candidate-primitive shape + quarantine writer in `packages/ingest-kit/src/draft.ts` (writes only to `design/catalog/ingested/`).
- [X] T004 Define the pluggable parse-layer interface in `packages/ingest-kit/src/parser/index.ts` (source → analyzable tree + type-resolution hook); implement the TypeScript-compiler backend.

## Phase 2: User Story 1 — Ingest a component & reuse it (Priority: P1) 🎯 MVP

**Goal**: `composer ingest react <file>` → quarantine draft (inert) → human `promote` → composable primitive.

**Independent Test**: `tests/integration/ingest-quarantine.test.ts` + `tests/integration/promote.test.ts`.

### Tests first (RED)

- [X] T005 [P] [US1] `tests/integration/ingest-quarantine.test.ts` — after `ingest`, a draft exists in `catalog/ingested/` AND `discover`/`compose` are byte-identical to no-draft (SC-002). RED.
- [X] T006 [P] [US1] `tests/integration/promote.test.ts` — `promote` moves a draft to the live catalog; name-collision is refused (FR-002/FR-007). RED.
- [X] T007 [P] [US1] `tests/fixtures/ingest-react/` — a sample `.tsx` component with typed props to ingest.

### Implementation (GREEN)

- [X] T008 [US1] Implement `@composer/ingest-react`: TSX prop-types → candidate primitive (Zod schema + draft template + metadata stub) via the TS-compiler backend.
- [X] T009 [US1] Implement `composer ingest <plugin> <source>` in `packages/cli/src/commands/ingest.ts` (CLI-only; resolves the plugin, runs it, writes to quarantine). Remove `ingest` from the reserved exit-99 set in `packages/cli/src/commands/reserved.ts`.
- [X] T010 [US1] Implement `composer promote <draft>` in `packages/cli/src/commands/promote.ts` (moves draft → `catalog/primitives/`; refuses overwrite). Remove `promote` from the reserved set.
- [X] T011 [US1] Wire both commands into the CLI binary; rebuild; confirm T005/T006 GREEN and a promoted primitive composes (incl. as an inline/slot child).

**Checkpoint**: end-to-end ingest→review→promote→compose works; drafts proven inert pre-promote.

## Phase 3: User Story 2 — `defineIngester` SDK (Priority: P2)

**Goal**: an adapter author can ship an ingester via the SDK, paired with the adapter; round-trip is testable.

- [X] T012 [US2] Implement `defineIngester()` in `packages/ingest-kit/src/define-ingester.ts` (codec contract: parser backend + AST→primitive + emit-template), symmetric with `defineAdapter`.
- [X] T013 [US2] Refactor `@composer/ingest-react` to be authored via `defineIngester` (dogfood the SDK).
- [X] T014 [US2] `tests/contract/ingest-bijection.test.ts` — for a paired adapter+ingester (reuse the keyvalue or react fixture), ingest → compose → re-ingest round-trips the JSON (FR-009/SC-003).

## Phase 4: User Story 3 — Non-TS parser backend (Priority: P3)

**Goal**: prove the parse layer is pluggable beyond the TS compiler.

- [X] T015 [P] [US3] Add a tree-sitter (or format-native) parser backend behind the same `parser` interface in `packages/ingest-kit/src/parser/`.
- [X] T016 [US3] Implement a minimal non-TS ingester (e.g. a tiny `key=value` or SQL-DDL source) using that backend; assert `composer ingest` uses the alternate parser (SC-005).

## Phase 5: Polish & Cross-Cutting

- [X] T017 [P] Extend `composer doctor`'s 30-line report to cover ingested/promoted templates (FR-010).
- [X] T018 [P] Assert the gate mechanically: a test confirming there is NO MCP `ingest`/`promote` tool and the agent surface is unchanged (FR-004/SC-004).
- [X] T019 [P] Docs: an "Ingesting existing code" section (README/docs) covering ingest→review→promote and authoring an ingester via the SDK.
- [X] T020 [P] Make `composer promote` run the quality gate as a **blocking precondition** — refuse a draft failing the available checks (bijection round-trip, 30-line, structural validity) unless `--force` (records the overridden findings). Shared gate driven by `004` FR-007/SC-002; `004` enriches the check set (metadata-completeness + total-functional). *(Implemented in the 004 session: `promote` runs `gradeDraft` — blocking 30-line/total-functional/metadata, advisory coherence, CI-deferred bijection — and refuses unless `--force`, recording findings in `qualityOverride`.)*
- [X] T021 Full gate: `pnpm -r build && pnpm test`; confirm 0 regressions.

---

## Dependencies & Execution Order

- Setup (T001–T004) before everything.
- US1: tests (T005–T007) RED → impl (T008–T010) → T011 GREEN. T009/T010 touch CLI + reserved.ts (sequential on reserved.ts).
- US2 (T012–T014) builds on US1's react plugin (T013 refactors it).
- US3 (T015–T016) builds on the parser interface (T004) + SDK (T012).
- Polish (T017–T021) last; T021 is the final gate.

## Implementation Strategy

MVP = US1 (T001–T011): the full ingest→promote→reuse loop for React, with drafts proven inert. US2 generalizes it into the SDK; US3 proves parser pluggability; Polish enforces the gate + discipline. The human `promote` gate (FR-003) is invariant across all phases — no auto-promote, no agent surface.
