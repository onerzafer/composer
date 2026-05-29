---
description: "Task list for 002-fix-commonjs-host"
---

# Tasks: Composer works in CommonJS host projects

**Input**: Design documents from `/specs/002-fix-commonjs-host/`

**Prerequisites**: plan.md, spec.md (present); research.md, quickstart.md (present)

**Tests**: REQUIRED — a regression test is part of the spec (FR-005) and constitution Quality Gates (drift/atomic behaviour must stay green). Write the test RED before the fix.

**Organization**: Grouped by user story so each is independently completable and testable.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-dependency)
- **[Story]**: Maps to a user story from spec.md (US1, US2)
- All paths are repository-relative

---

## Phase 1: Setup

- [X] T001 [US1] Create CommonJS host fixture at `tests/fixtures/cjs-host/`: a host `package.json` **without** `"type":"module"`, plus a minimal workspace (`composer.json` → `workspace: "./design"`, `design/catalog/index.ts` with one primitive + `PrimitiveNode`, `design/output.map.ts` with `export default { byPrimitive: {...} }`, `design/templates/<primitive>.ts.hbs`, and `design/specs/<id>.json`). The fixture MUST NOT contain a `design/package.json` (so the loader sees the host's CommonJS context — this is what reproduces the bug).

---

## Phase 2: User Story 1 — Adopt Composer in a CommonJS host project (Priority: P1) 🎯 MVP

**Goal**: `composer init` + compose work in a host whose `package.json` has no `"type":"module"`.

**Independent Test**: `pnpm vitest run tests/integration/cjs-host.test.ts` — compose in the CJS fixture writes its output file with no loader crash.

### Test first (RED)

- [X] T002 [US1] Write `tests/integration/cjs-host.test.ts`: symlink/resolve deps so the fixture's `zod` resolves, run `compose()` against the `cjs-host` fixture spec, and assert the expected output file is written. Confirm it FAILS against current `@composer/core` (reproduces `Cannot read properties of undefined`). (FR-005, SC-001)

### Implementation (GREEN)

- [X] T003 [US1] In `packages/core/src/pipeline/orchestrator.ts` `loadOutputMap`: after `const exported = mod.default ?? mod`, if `exported` has no `byPrimitive` but `exported.default?.byPrimitive` exists, descend one level. Shape-aware so ESM hosts are unaffected. (FR-001, FR-003)
- [X] T004 [US1] In `packages/core/src/pipeline/orchestrator.ts` `loadAuditModule`: resolve to the audit function across `default`, nested `default`, or named `audit`; only descend when the current value is not callable. (FR-002, FR-003)
- [X] T005 [P] [US1] Verify `packages/typescript/src/compile.ts` catalog load is unaffected (`PrimitiveNode` is a named export, not `default`); add the same nested-`default` tolerance only if a CJS host breaks it. (FR-003)
- [X] T006 [US1] In `packages/cli/src/commands/init.ts`, emit a workspace-local `package.json` containing `{"type":"module"}` into the workspace folder for both `--bare` and `--extends` modes; do NOT overwrite an existing one; append the path to `filesWritten`. (FR-004)
- [X] T007 [US1] Rebuild `@composer/core` and `@composer/cli` (`pnpm --filter @composer/core --filter @composer/cli build`) and confirm `tests/integration/cjs-host.test.ts` now PASSES (GREEN). (SC-001)

**Checkpoint**: compose succeeds in a CommonJS host; init seeds the workspace `type:module`.

---

## Phase 3: User Story 2 — Backend adopter guidance (Priority: P2)

**Goal**: Docs let a developer reach a building, booting app on a CommonJS backend.

**Independent Test**: A reader follows the docs and instruments a CommonJS backend without consulting source.

- [X] T008 [P] [US2] Add a "CommonJS / backend adoption" section to `README.md` (or `docs/`): the workspace `{"type":"module"}` convention, excluding the workspace directory from the host's `tsconfig` build, and the `@as-integrations/express5` dependency for NestJS 11 GraphQL hosts. (FR-006, SC-003)

---

## Phase 4: Polish & Cross-Cutting

- [X] T009 Run the full suite and builds (`pnpm -r build && pnpm test`); confirm 0 regressions for ESM hosts (existing tests stay green). (SC-002)

---

## Dependencies & Execution Order

- T001 → T002 (fixture before the test that uses it).
- T002 (RED) → T003, T004 (fix), then T007 (GREEN). T003 and T004 edit the same file (`orchestrator.ts`) → sequential, not parallel.
- T005 [P] (different file) can run alongside T003/T004.
- T006 (`init.ts`, different file) independent of the loader fix; can run in parallel with T003/T004 but is part of US1.
- T008 [P] (docs) independent — any time after the behaviour is settled.
- T009 last (full-suite gate).

## Parallel Example

After T002 is RED: T003/T004 (orchestrator) and T006 (init.ts) and T005 (compile.ts) touch different files — T005 and T006 can run in parallel with the orchestrator fix.

## Implementation Strategy

MVP = US1 (T001–T007): the engine works in CommonJS hosts with a guarding regression test. US2 (docs) and Polish follow. Ship as v0.1.1.
