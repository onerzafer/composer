---

description: "Task list for 005-fix-compose-lock-leak"
---

# Tasks: Fix compose lock-leak deadlock

**Input**: Design documents from `/specs/005-fix-compose-lock-leak/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: INCLUDED. The spec's *User Scenarios & Testing* section is mandatory and gives an Independent Test + Acceptance Scenarios per story; the repo already runs a vitest suite (`tests/{contract,integration,e2e}`, `packages/*/src/**/*.test.ts`). Tests are written first and must FAIL before the matching implementation task.

**Organization**: Tasks grouped by user story (US1 P1, US2 P2, US3 P3) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)
- Exact file paths included in every task.

## Path Conventions

Monorepo (pnpm): engine in `packages/core/src/`, CLI in `packages/cli/src/`, MCP in `packages/mcp/src/`, tests at repo root `tests/`. Test runner: `vitest run` (root `vitest.config.ts`, `testTimeout: 30_000`; the glob `tests/**/*.test.ts` already covers a new `tests/unit/`). Tests MUST inject millisecond budgets so they never approach the 30 s timeout.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm a clean baseline and the test location.

- [X] T001 Confirm a green baseline before any change: run `pnpm -r build && pnpm test` from the repo root and record that all suites pass (so later red is attributable to 005).
- [X] T002 [P] Create the `tests/unit/` directory (add `tests/unit/.gitkeep`); confirm `vitest.config.ts` `include` already matches `tests/**/*.test.ts` (no config edit needed).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single source of truth for both tunables (`maxComposeDurationMs`, `maxHoldMs`) and the FR-002 invariant. Every story's real wiring reads this.

**⚠️ CRITICAL**: No user-story implementation can begin until limits resolution exists.

- [X] T003 [P] Write failing unit test `tests/unit/limits.test.ts` for `resolveLimits()` per contracts/config-cli-mcp.md L1–L5: defaults (`120000`/`180000`), `composer.json.limits` override, env precedence (`COMPOSER_COMPOSE_MAX_DURATION_MS`, `COMPOSER_LOCK_MAX_HOLD_MS`), invariant violation (`maxHoldMs < maxComposeDurationMs + ttlMarginMs`) → `ComposerConfigError`, and non-integer/≤0 rejection.
- [X] T004 Implement `EffectiveLimits`, `DEFAULT_LIMITS` (`maxComposeDurationMs: 120000`, `maxHoldMs: 180000`, `ttlMarginMs = floor(maxComposeDurationMs/2)`), and `resolveLimits(projectRoot, env = process.env)` with the `maxHoldMs ≥ maxComposeDurationMs + ttlMarginMs` invariant (throws `ComposerConfigError` naming both values + active env override) in `packages/core/src/config/limits.ts` (NEW).
- [X] T005 Extend `ComposerConfig`, `validateComposerConfig`, and `ALLOWED_KEYS` to accept an optional `limits` object (object if present; each sub-field integer > 0; unknown sub-keys rejected) in `packages/core/src/workspace/validate-config.ts`.
- [X] T006 [P] Update the JSON-Schema source-of-truth `specs/001-composer-toolkit-v0/contracts/composer-json.schema.json` to document the optional `limits` object (`maxComposeDurationMs`, `maxHoldMs`: positive integers).
- [X] T007 Export `resolveLimits`, `EffectiveLimits`, `DEFAULT_LIMITS` from `packages/core/src/index.ts`.

**Checkpoint**: `resolveLimits()` resolves defaults/config/env with the invariant enforced; T003 passes. User stories can begin.

---

## Phase 3: User Story 1 - A stuck compose self-heals; the next compose succeeds (Priority: P1) 🎯 MVP

**Goal**: An abandoned/hung compose's lock is reclaimed automatically once it outlives the max-hold TTL — even when the holder PID is alive (orphaned, 0% CPU) — so a retry succeeds with **zero** manual `kill`. A genuinely in-progress compose (within TTL) is never interrupted.

**Independent Test**: Write `compose.lock` with a live PID and a `started_at` far in the past → `acquire()` reclaims (no `LockHeldError`). With a fresh `started_at` → `acquire()` still throws `LockHeldError`. End-to-end: the spec's reproduced wedge → a retry compose succeeds without killing the holder.

### Tests for User Story 1 (write first — must FAIL) ⚠️

- [X] T008 [P] [US1] Write failing unit tests `tests/unit/workspace-lock.test.ts` for `acquire()`/`release()` per contracts/workspace-lock.md A1–A8 + R1–R4: O_EXCL create, dead-PID reclaim, unparseable reclaim, **age-stale-but-alive reclaim**, within-TTL `LockHeldError`, EPERM-past-TTL reclaim, reclaim-race exactly-one-winner, clock-skew clamp, and ownership-checked release no-op after reclaim. Inject small `maxHoldMs` + a fake `now()`.
- [X] T009 [P] [US1] Write failing integration test `tests/integration/lock-self-heal.test.ts` reproducing the spec wedge (live-PID lock with old `started_at` → next `compose` reclaims and succeeds; fresh lock → `LOCK_HELD`). Uses `makeFixture` + injected millisecond `maxHoldMs` via `composer.json` `limits`. Also assert reclaim succeeds **regardless of the holder's process lineage** (orphaned/re-parented live PID — the spec's "orphaned holder after consumer restart" edge / FR-011), confirming recovery needs no daemon restart.

### Implementation for User Story 1

- [X] T010 [US1] Rewrite `WorkspaceLock` constructor + `acquire()` in `packages/core/src/lock/workspace-lock.ts`: constructor takes `(lockPath, opts?: { maxHoldMs?; now?: () => number })` defaulting to `DEFAULT_LIMITS.maxHoldMs`/`Date.now`; `acquire()` becomes an `openSync(path, "wx")` create with a bounded (≤5) reclaim-retry loop driven by an `isReclaimable(existing, now, maxHoldMs)` predicate (unparseable | dead PID | `age > maxHoldMs`, where `age = max(0, now - Date.parse(started_at))`); record ownership identity `(pid, started_at)` on success.
- [X] T011 [US1] Implement ownership-checked `release()` in `packages/core/src/lock/workspace-lock.ts`: read the current lock file and `unlinkSync` only when on-disk `(pid, started_at)` equals the recorded identity; mismatch/absent → no-op (best-effort on I/O errors). (FR-006)
- [X] T012 [US1] Update `withWorkspaceLock()` in `packages/core/src/lock/workspace-lock.ts` to use the same ownership-checked `release()` in `finally` (parity so no caller reintroduces the unconditional-unlink bug).
- [X] T013 [US1] In `packages/core/src/pipeline/orchestrator.ts`, call `resolveLimits(resolved.projectRoot)` and pass `{ maxHoldMs }` into `new WorkspaceLock(lockPath, { maxHoldMs })` so the real compose path honors the configured TTL.

**Checkpoint**: T008/T009 pass. A wedged live-PID lock self-heals on the next compose; within-TTL composes still fail fast. **MVP is functional** even without US2.

---

## Phase 4: User Story 2 - Bounded compose: it can never hang forever (Priority: P2)

**Goal**: `compose` runs under a wall-clock budget; on exceed it aborts, releases the lock, and returns a typed timeout error — without ever leaving half-written state. This bounds the common case in-process so the workspace isn't blocked for a whole TTL each time.

**Independent Test**: Inject a compose body that sleeps beyond the budget → the call rejects with a typed `ComposeTimeoutError` within budget + margin, and `compose.lock` no longer exists. A compose that finishes under budget is unchanged (no added latency).

### Tests for User Story 2 (write first — must FAIL) ⚠️

- [X] T014 [P] [US2] Write failing integration test `tests/integration/compose-timeout.test.ts`: an injected hanging pipeline phase + tiny `maxComposeDurationMs` → rejects with `ComposeTimeoutError` (`code: "COMPOSE_TIMEOUT"`) within budget+margin; assert `.composer/cache/compose.lock` is gone and the workspace tree is byte-identical (nothing committed).
- [X] T015 [P] [US2] Extend `tests/integration/atomic-rollback.test.ts` with a timeout-injection case asserting byte-identical tree + no lock + no commit even if the stalled step later resolves (Constitution III / O3). Add a second assertion that a budget expiring at/after the pre-commit checkpoint does **not** yield a `ComposeTimeoutError` for a compose that actually committed (timer disarmed before `commit`; O5).
- [X] T016 [P] [US2] Update contract test `tests/contract/mcp-compose.test.ts`: a budget-exceeded MCP `compose` returns an `isError` result carrying the typed `COMPOSE_TIMEOUT` message, and an **immediate retry does not see `LOCK_HELD`** (FR-008); a genuinely concurrent within-TTL compose still returns `LOCK_HELD`.

### Implementation for User Story 2

- [X] T017 [US2] Add `ComposeTimeoutError` (`code: "COMPOSE_TIMEOUT"`, fields `durationMs`, `specId`, `surface`) in `packages/core/src/pipeline/orchestrator.ts` and export it from `packages/core/src/index.ts`.
- [X] T018 [US2] In `orchestrateCompose` (`packages/core/src/pipeline/orchestrator.ts`), read `resolveLimits().maxComposeDurationMs`, arm `setTimeout(...).unref()` that calls `controller.abort(new ComposeTimeoutError(...))`, wrap the body in `Promise.race([runPipeline(signal, ...), abortPromise])`, `clearTimeout` in `finally`, and throw `ComposeTimeoutError` on abort (lock release stays in `finally`, now ownership-checked → released before the error propagates, FR-005/FR-008). **Disarm the timer (`clearTimeout`) and detach the race immediately before the `commit` phase so a timeout can never interleave with the atomic commit (commit is a bounded, uninterruptible critical section).** Depends on T013.
- [X] T019 [US2] Thread the `AbortSignal` into `runPipeline` and call `signal.throwIfAborted()` at each phase boundary and **mandatorily immediately before the `commit` phase**, **then clear the budget timer so `commit` runs uninterruptibly**, in `packages/core/src/pipeline/orchestrator.ts` (guarantees no half-written state, and no timeout returned for an actually-committed compose, if a stalled `await` resolves post-timeout — Constitution III, analyze U1). Depends on T018.
- [X] T020 [US2] Map `ComposeTimeoutError` to a CLI exit code (next free = `9`) in `translateComposeError` of `packages/cli/src/commands/compose.ts`.
- [X] T021 [US2] Ensure the MCP `compose` tool surfaces the typed `COMPOSE_TIMEOUT` message via the existing error path in `packages/mcp/src/tools/compose.ts` — **no new tool, no new field** (Constitution IV).

**Checkpoint**: T014–T016 pass. A hung compose self-terminates with a typed error and a released lock; atomicity preserved; healthy composes unchanged.

---

## Phase 5: User Story 3 - Operator can see and break a stuck lock (Priority: P3)

**Goal**: `doctor` reports an age-exceeded live-PID lock as reclaimable (with pid, age, surface, spec_id); `doctor --fix` removes reclaimable locks; `compose --force` force-breaks a lock as a last resort. CLI-only (humans).

**Independent Test**: Run `doctor` against a workspace whose lock is alive-PID but age-exceeded → it is reported reclaimable; `doctor --fix` removes it and a subsequent compose succeeds; a within-TTL lock is left untouched.

### Tests for User Story 3 (write first — must FAIL) ⚠️

- [X] T022 [P] [US3] Write failing integration test `tests/integration/doctor-stale-lock.test.ts` per contracts/config-cli-mcp.md D1–D5: age-stale live-PID lock → `warn` reclaimable including pid/age/surface/spec_id and NOT auto-removed; `doctor --fix` removes it; within-TTL live lock → `info`, untouched; dead-PID/unparseable still auto-removed.
- [X] T023 [P] [US3] Write failing integration test `tests/integration/compose-force.test.ts`: a held lock + `composer compose <id> --force` force-breaks then composes; with no lock, `--force` behaves as a normal compose (C1/C2).

### Implementation for User Story 3

- [X] T024 [US3] Extend `runStaleLockReport` in `packages/cli/src/commands/doctor.ts` to read `started_at`, compute age against `resolveLimits().maxHoldMs`, and emit a `warn` "reclaimable" report (pid, age, surface, spec_id) for age-stale live-PID locks while keeping dead-PID/unparseable auto-removal and adding an `info` line for within-TTL live locks. (FR-009)
- [X] T025 [US3] Add a `fix?: boolean` to `DoctorOptions` and remove reclaimable locks (dead/unparseable/age-stale) when set, in `packages/cli/src/commands/doctor.ts`; never remove a within-TTL live lock. (FR-010)
- [X] T026 [US3] Add `force?: boolean` to `ComposeCliOptions` and force-break the existing lock (unlink `compose.lock`) before composing when set, in `packages/cli/src/commands/compose.ts`. (FR-010, CLI-only)
- [X] T027 [US3] Wire the flags in `packages/cli/src/bin.ts`: `--fix` on the `doctor` command and `--force` on the `compose` command (commander `.option(...)`, threaded into the option objects).

**Checkpoint**: T022/T023 pass. Operators can see and break a stuck lock through supported commands.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T028 [P] Document in `docs/` (and add a README pointer): default `maxComposeDurationMs`/`maxHoldMs`, the `composer.json` `limits` block, the two env vars, the FR-002 invariant, and the operator one-liners (`composer doctor --fix`, `composer compose <id> --force`); include the consumer guidance to set the MCP client request timeout consistent with the server budget.
- [X] T029 Run the `specs/005-fix-compose-lock-leak/quickstart.md` validation (§1–§5) end-to-end and confirm SC-001..SC-006 hold.
- [X] T030 Final gate: `pnpm -r build && pnpm test` green (all prior + new suites), zero regressions.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **BLOCKS all user stories** (every story reads `resolveLimits`).
- **US1 (Phase 3)**: depends on Foundational. Independently testable and shippable (reclaim alone un-wedges) → MVP.
- **US2 (Phase 4)**: depends on Foundational + US1's orchestrator lock wiring (T013) since both edit `orchestrator.ts`; still independently testable (timeout behavior).
- **US3 (Phase 5)**: depends on Foundational (`maxHoldMs`); independent of US1/US2 behavior.
- **Polish (Phase 6)**: depends on all desired stories.

### Within-file sequencing (NOT parallel — same file)

- `packages/core/src/lock/workspace-lock.ts`: T010 → T011 → T012.
- `packages/core/src/pipeline/orchestrator.ts`: T013 (US1) → T017 → T018 → T019 (US2).
- `packages/cli/src/commands/compose.ts`: T020 (US2) → T026 (US3).
- `packages/cli/src/commands/doctor.ts`: T024 → T025.
- `packages/core/src/index.ts`: T007 (foundational) → T017 (US2 export).

### Cross-task dependencies

- T004 ← T003 (test first). T005, T006, T007 follow T004.
- T010–T012 ← T008 (tests first). T013 ← T010–T012 + T004/T007.
- T017 ← (error type) ; T018 ← T017 + T013 ; T019 ← T018 ; T020/T021 ← T017.
- T024/T025 ← T004 (maxHoldMs) + T022 ; T026 ← T023 ; T027 ← T024–T026.

### Parallel Opportunities

- T003 [P] and T006 [P] within Foundational.
- US1 tests T008 [P] + T009 [P] together (different files).
- US2 tests T014 [P] + T015 [P] + T016 [P] together.
- US3 tests T022 [P] + T023 [P] together.
- Once Foundational is done, US1 and US3 can proceed in parallel (different files: lock/orchestrator vs doctor/bin); US2 should follow US1 on `orchestrator.ts`.
- T028 [P] (docs) anytime after the surfaces stabilize.

---

## Parallel Example: User Story 1

```bash
# Write both US1 test files first (must fail):
Task: "Unit tests for WorkspaceLock acquire/release in tests/unit/workspace-lock.test.ts"
Task: "Integration self-heal test in tests/integration/lock-self-heal.test.ts"
# Then implement sequentially on the single lock file (T010 → T011 → T012), then wire T013.
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (limits) → 3. Phase 3 US1 (age reclaim + ownership release + orchestrator wiring).
4. **STOP and VALIDATE**: reproduce the spec wedge; confirm a retry self-heals with zero kills (SC-001/SC-002/SC-005).
5. Ship — the deadlock is fixed even before US2.

### Incremental Delivery

- US1 → un-wedge guarantee (MVP).
- US2 → bound the common case in-process (typed timeout, no whole-TTL stalls), atomicity preserved.
- US3 → operator visibility + supported force-break.

### Parallel Team Strategy

After Foundational: Dev A on US1 (lock + orchestrator wiring), Dev C on US3 (doctor + bin) in parallel; Dev B picks up US2 once US1's `orchestrator.ts` wiring (T013) lands.

---

## Notes

- [P] = different files, no incomplete-task dependency. [Story] label maps each task to a spec user story for traceability.
- Every test task is written to FAIL first (TDD); verify red before the implementation task.
- Tests inject millisecond `maxComposeDurationMs`/`maxHoldMs` (via `composer.json` `limits`, env, or constructor opts) to stay well under vitest's 30 s `testTimeout`.
- Constitution guardrails: no new MCP tool (IV); abort checkpoint before `commit` keeps compose atomic (III). `--force`/`--fix` are CLI-only.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
