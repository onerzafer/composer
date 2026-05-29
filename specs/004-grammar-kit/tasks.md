---
description: "Task list for 004-grammar-kit"
---

# Tasks: Grammar-kit — guided, human-owned vocabulary authoring

**Input**: Design documents from `/specs/004-grammar-kit/`

**Prerequisites**: plan.md, spec.md (present); research.md, contracts/, quickstart.md (present)

**Tests**: REQUIRED for the deterministic path (author→stage→promote→compose), the quality report, and the blocking promote-precondition (per plan.md Decision 7). The interview phases are prose skills, validated by a golden fixture/transcript, not unit tests.

**⚠️ Cross-feature dependency**: `004` **reuses `003`'s staging + `promote` gate** and therefore depends on `003-ingest-promote` being implemented first. Build order: `003` → `004`. Also: the FR-007 quality **precondition** on `promote` (T018) applies to the *shared* gate, so the same precondition must be added to `003`'s `promote` tasks.

**Organization**: Grouped by user story (US1 P1 author-via-interview; US2 P2 quality gate; US3 P3 extend-existing). The human `promote` gate (FR-004) and "no new MCP tool" (FR-005) are cross-cutting invariants asserted in tests.

---

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no incomplete-dependency)
- **[Story]**: US1 / US2 / US3 (Setup/Foundational/Polish carry no story label)
- All paths repository-relative

---

## Phase 1: Setup

- [ ] T001 Scaffold `packages/grammar-kit/` (package.json depending on `@composer/ingest-kit` + `@composer/core`, tsconfig, dirs `skills/ templates/ taxonomy/ scripts/ src/`, `manifest.json`).
- [ ] T002 [P] Add spec-kit-style path-resolution + setup scripts under `packages/grammar-kit/scripts/` (resolve workspace/catalog/staging paths; JSON output).
- [ ] T003 [P] Author the per-artifact templates `packages/grammar-kit/templates/vocabulary-brief.md` and `packages/grammar-kit/templates/catalog-design.md`.

## Phase 2: Foundational (blocking prerequisites)

- [ ] T004 Wire `packages/grammar-kit` to `003`'s staging dir + `promote` gate via `@composer/ingest-kit` (no second gate). Requires `003` implemented.
- [ ] T005 Author the grammar-specific clarify taxonomy in `packages/grammar-kit/taxonomy/` (primitive-boundary, fields/props, composition rules, output mapping, naming, 30-line decomposition, total-functional). Shared by `grammar.clarify` and the quality gate.
- [ ] T006 Add the `composer grammar <phase>` CLI router stub in `packages/cli/src/commands/grammar.ts` (deterministic helpers; activation defers to `composer promote`).

**Checkpoint**: package + scripts + taxonomy + CLI router exist; staging/promote reachable from grammar-kit.

## Phase 3: User Story 1 — Author a primitive via guided interview (Priority: P1) 🎯 MVP

**Goal**: intent → interview → draft-to-staging → human `promote` → composable primitive.

**Independent Test**: `tests/integration/grammar-author-stage.test.ts` + `tests/integration/grammar-promote-compose.test.ts`.

### Tests first (RED)

- [ ] T007 [P] [US1] Golden fixture `tests/fixtures/grammar-kit/` — a sample vocabulary brief + the expected drafted schema/template.
- [ ] T008 [P] [US1] `tests/integration/grammar-author-stage.test.ts` — authoring writes a draft to the `003` staging dir AND `discover`/`scaffold`/`compose` are byte-identical to no-draft (SC-003). RED.
- [ ] T009 [P] [US1] `tests/integration/grammar-promote-compose.test.ts` — `promote` a grammar-authored draft (via the `003` gate), then `compose` a spec using it emits source (SC-001). RED.

### Implementation (GREEN)

- [ ] T010 [US1] `grammar.specify` skill (NL intent → vocabulary brief) in `packages/grammar-kit/skills/grammar.specify.md`.
- [ ] T011 [US1] `grammar.clarify` skill — recommend-first, ≤5-question interview over the taxonomy (T005), writing answers back into the brief — `packages/grammar-kit/skills/grammar.clarify.md` (FR-002; centerpiece).
- [ ] T012 [US1] `grammar.plan` skill (brief → catalog design: union shape, per-primitive Zod fields, slot registry, output.map, template plan) in `packages/grammar-kit/skills/grammar.plan.md`.
- [ ] T013 [US1] `grammar.tasks` skill (design → per-primitive authoring task list) in `packages/grammar-kit/skills/grammar.tasks.md`.
- [ ] T014 [US1] `grammar.author` skill + CLI stage helper `packages/grammar-kit/src/stage.ts`: draft Zod schema + `.hbs` template + metadata into the `003` staging dir ONLY (FR-003).
- [ ] T015 [US1] Wire `composer grammar` to the stage helper and confirm `composer promote` (003) activates a grammar-authored draft identically; make T008/T009 pass GREEN (FR-004/FR-009).

**Checkpoint**: full intent→promote→compose loop works; drafts proven inert pre-promote.

## Phase 4: User Story 2 — Verify grammar quality before promoting (Priority: P2)

**Goal**: a quality report a human trusts, enforced as a blocking precondition on `promote`.

**Independent Test**: `tests/contract/grammar-quality.test.ts` + the promote-precondition test (T018).

- [ ] T016 [P] [US2] `tests/contract/grammar-quality.test.ts` — quality report flags an oversized (30-line) template, missing `whenNotToUse`/example, incoherent schema↔template, and a control-flow primitive (FR-007). RED.
- [ ] T017 [US2] Implement `composer grammar check`: reuse/extend `composer doctor` (drift/sprawl/30-line/naming/bijection) and add metadata-completeness + total-functional checks, in `packages/grammar-kit/src/quality.ts` (+ doctor hook in `packages/core`) (FR-006/FR-007/FR-008).
- [ ] T018 [US2] Wire the quality gate into `composer promote` as a **blocking precondition**: a draft failing any check is refused unless `--force` (which records the overridden findings). Test: a failing draft is refused; `--force` promotes (FR-007/SC-002). Apply to the shared gate (also update `003`'s `promote`).
- [ ] T019 [US2] `grammar.checklist` skill wrapping `composer grammar check` as an advisory pre-promote report in `packages/grammar-kit/skills/grammar.checklist.md`.

## Phase 5: User Story 3 — Extend an existing vocabulary (Priority: P3)

**Goal**: incremental authoring stays consistent with an existing catalog.

- [ ] T020 [US3] Make `grammar.specify`/`grammar.clarify` catalog-aware: surface existing primitives for context, suggest reuse / flag overlap (update the skills + taxonomy).
- [ ] T021 [US3] Confirm `composer promote` refuses a name collision for grammar-authored drafts (reuse `003`'s collision check); cover in `tests/integration/grammar-promote-compose.test.ts` (US3 #1).

## Phase 6: Polish & Cross-Cutting

- [ ] T022 [P] Install manifest + packaging so the grammar-kit skills install into a project's agent (model: `.specify` integrations) — `packages/grammar-kit/manifest.json` + install script.
- [ ] T023 [P] Assert the gate mechanically: a test confirming NO new tool was added to the composer MCP/agent surface and `discover/scaffold/validate/compose` are unchanged (FR-005/SC-004).
- [ ] T024 [P] Docs: an "Authoring a vocabulary with grammar-kit" section (README/docs) covering intent → interview → `promote` → `compose`.
- [ ] T025 Full gate: `pnpm -r build && pnpm test`; confirm 0 regressions.

---

## Dependencies & Execution Order

- **`003` must be implemented first** (staging + `promote`); T004 depends on it.
- Setup (T001–T003) → Foundational (T004–T006) → user stories.
- US1: tests (T007–T009) RED → impl (T010–T015) GREEN. T010–T013 are separate skill files ([P]-able); T014/T015 touch the stage helper + CLI (sequential).
- US2 (T016–T019): T016 RED → T017 (quality impl) → T018 (blocking precondition; depends on T015 promote + T017) → T019 (checklist skill). Depends on US1 + the taxonomy (T005).
- US3 (T020–T021) depends on US1.
- Polish (T022–T025) last; T025 is the final gate.

## Parallel Example

After Foundational: skill files T010/T011/T012/T013 are different files and can be drafted in parallel; T007 (fixture) ‖ T008 ‖ T009 (tests) in parallel before implementation.

## Implementation Strategy

MVP = US1 (T001–T015): the guided intent→promote→compose loop with the clarify interview as centerpiece, reusing `003`'s gate. US2 adds the quality gate **and enforces it as a blocking precondition on `promote`** (T018); US3 adds catalog-aware incremental authoring; Polish enforces the "no new MCP surface" invariant + docs. The human `promote` gate (FR-004) holds across every phase.
