# Implementation Plan: Fix compose lock-leak deadlock

**Branch**: `005-fix-compose-lock-leak` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-fix-compose-lock-leak/spec.md`

**Base architecture plan**: [/specs/001-composer-toolkit-v0/plan.md](../001-composer-toolkit-v0/plan.md)

**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) (v1.0.0)

## Summary

A hung `compose` holds the whole-workspace lock forever: the lock is released only in a `finally` wrapped around an **unbounded** pipeline body, and `acquire()` reclaims a lock only when its recorded PID is **dead**. So when a compose stalls (the observed wedge was a `tsx`-loader await-deadlock sitting at 0% CPU), the live-but-stuck holder keeps the lock and every later compose fails `LOCK_HELD` until a human kills the PID.

The fix makes the lock **self-heal** with three complementary mechanisms, all inside Composer (no consumer change, no new MCP tool):

1. **Age-based reclaim** — `WorkspaceLock.acquire()` reclaims a lock whose `started_at` is older than a configurable max-hold TTL, *even if the PID is alive*. A genuinely in-progress compose (alive PID, within TTL) still fails fast with `LockHeldError`. This is the **hard guarantee**: recovery happens even when the holder's event loop is wedged.
2. **Bounded compose** — `orchestrateCompose` runs the pipeline under a wall-clock budget via `AbortController` + `Promise.race`. On budget exceed it aborts, releases the lock, and throws a typed `ComposeTimeoutError`. Abort checkpoints before the mutating phases preserve Atomic Compose even if a stuck `await` later resolves. This bounds the **common** case in-process so the workspace isn't blocked for a whole TTL each time.
3. **Ownership-checked release** — `release()` only deletes a lock file whose `(pid, started_at)` still matches what this instance wrote, so a slow holder that finishes after being reclaimed cannot delete the *new* holder's lock.

Acquire is upgraded to an **atomic** `O_EXCL` create with a bounded reclaim-retry loop so a reclaim race produces exactly one winner; the losers see `LockHeldError` against the *new* lock. The TTL and duration budget are configurable (optional `limits` block in `composer.json`, env-var override) with documented defaults. `doctor` is extended to report an age-exceeded live-PID lock as reclaimable; `doctor --fix` and `compose --force` give operators a supported force-break.

## Technical Context

**Language/Version**: TypeScript 5.x, Node ≥ 20 (ESM monorepo, pnpm workspaces).

**Primary Dependencies**: in-repo only — `@composer/core` (`src/lock/workspace-lock.ts`, `src/pipeline/orchestrator.ts`, `src/workspace/validate-config.ts`), `@composer/cli` (`src/commands/doctor.ts`, `src/commands/compose.ts`, `commander`-based `src/bin.ts`), `@composer/mcp` (`src/tools/compose.ts`). Runtime primitives: `node:fs`, `node:path`, built-in `AbortController`/`AbortSignal`/`setTimeout`. No new third-party dependency.

**Storage**: lock file JSON at `<workspaceRoot>/.composer/cache/compose.lock`; tunables in `composer.json` (project root).

**Testing**: `vitest run` (root `vitest.config.ts`, `testTimeout: 30_000`). Tests live in `tests/{contract,integration,e2e}` and `packages/*/src/**/*.test.ts`. New tests MUST drive durations down to milliseconds via config/options so they never approach the 30 s vitest timeout. Unit tests for `WorkspaceLock` go under `tests/unit/` (new) or `packages/core/src/lock/`.

**Target Platform**: Node CLI + MCP stdio server on macOS/Linux. PID liveness via `process.kill(pid, 0)` (POSIX idiom; signal 0 works on Windows too). Wall-clock `started_at` (ISO 8601).

**Project Type**: TypeScript library + CLI + MCP server (monorepo). Single project, multiple packages.

**Performance Goals**: zero added latency for a healthy compose (the budget timer is cleared on normal completion; no extra I/O on the hot path). Automatic recovery within one max-hold TTL window.

**Constraints**: MUST preserve Atomic Compose (constitution III) — no half-written state on timeout/abort. MUST NOT add an MCP tool or escape hatch on the agent surface (constitution IV). Wall-clock based, clock-skew tolerant (negative/just-acquired ages clamp to "fresh"). The single whole-workspace lock model is retained — this fixes its lifecycle, it does not redesign locking granularity.

**Scale/Scope**: one lock per workspace; a handful of files touched in `core`, `cli`, `mcp`; new unit + integration tests; one docs section.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Impact | Verdict |
|-----------|--------|---------|
| I. Schema-Compiled Composition | No change to authoring/compile model. | ✅ N/A |
| II. Three Surfaces, One Owner | No catalog/composition/compiler surface change. `--force`/`--fix` live on the **CLI (humans)**. | ✅ Pass |
| III. Atomic Compose | A timeout must not leave half-written state. Abort is checked at phase boundaries and **immediately before `commit`** (the only mutating phase), so an aborted compose never commits even if its stuck `await` later resolves. | ✅ Pass (load-bearing — see research R4) |
| IV. No Escape Hatches on Agent Surface | **No new MCP tool.** MCP change is limited to: bounded compose returns a typed timeout error with the lock already released. Force-break is CLI-only. | ✅ Pass |
| V. 30-Line Discipline | No templates/prep touched. | ✅ N/A |
| VI. Drift Detection | Unchanged; drift-check still runs before commit. | ✅ N/A |
| VII. Custom Adapters First-Class | Lock lifecycle is engine-level, identical for workspace and published adapters. | ✅ N/A |
| VIII. Total Functional Language | No catalog control-flow primitives added. | ✅ N/A |
| IX. TS/Zod Catalog Authoring | Engine code only; no catalog authoring change. | ✅ N/A |
| X. The Catalog Is the API | Untouched. | ✅ N/A |

**Quality Gates touched**: the existing *Atomic-rollback test* (`tests/integration/atomic-rollback.test.ts`) gains a timeout-injection case (inject a hang → assert lock released + nothing committed). No gate is weakened.

**Result**: PASS. No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-fix-compose-lock-leak/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — design decisions (TTL vs budget, abort semantics, atomicity)
├── data-model.md        # Phase 1 — LockData evolution, ownership identity, config shape
├── quickstart.md        # Phase 1 — how to verify the fix end-to-end
├── contracts/
│   ├── workspace-lock.md   # acquire()/release() behavior contract (age reclaim, O_EXCL, ownership)
│   └── config-cli-mcp.md   # composer.json limits, env overrides, doctor report, --fix/--force
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/core/src/
├── lock/
│   └── workspace-lock.ts        # CHANGE: age-based reclaim, O_EXCL atomic acquire,
│                                #         ownership-checked release; expose written identity
├── pipeline/
│   └── orchestrator.ts          # CHANGE: AbortController budget around runPipeline;
│                                #         abort checkpoints before render/commit;
│                                #         throw ComposeTimeoutError; release on every path
├── workspace/
│   └── validate-config.ts       # CHANGE: optional `limits` block (maxComposeDurationMs, maxHoldMs)
└── config/
    └── limits.ts                # NEW: resolve effective limits (defaults ← composer.json ← env)

packages/cli/src/
├── commands/
│   ├── doctor.ts                # CHANGE: runStaleLockReport reports age-stale live-PID lock as
│   │                            #         reclaimable (pid, age, surface, spec_id); --fix removes it
│   └── compose.ts               # CHANGE: thread `force` → force-break lock before compose
└── bin.ts                       # CHANGE: `--force` on compose, `--fix` on doctor

packages/mcp/src/tools/
└── compose.ts                   # CHANGE (minimal): surface typed timeout code; no new tool

tests/
├── unit/
│   └── workspace-lock.test.ts   # NEW: age reclaim, within-TTL hold, O_EXCL race, ownership release
├── integration/
│   ├── compose-timeout.test.ts  # NEW: hung body → typed timeout, lock gone, no commit
│   ├── lock-self-heal.test.ts   # NEW: reproduce the spec wedge → retry succeeds within one TTL
│   ├── doctor-stale-lock.test.ts# NEW: age-stale live-PID lock reported + --fix removes it
│   └── atomic-rollback.test.ts  # CHANGE: add timeout-injection rollback case
└── contract/
    └── mcp-compose.test.ts       # CHANGE: timeout returns typed error with lock released

docs/                            # CHANGE: document default budgets/TTL + force-break one-liner
```

**Structure Decision**: Single monorepo, existing package boundaries. The fix is concentrated in `@composer/core` (lock + orchestrator + config), with thin surface changes in `@composer/cli` (operator tools) and `@composer/mcp` (error typing only). A new tiny `core/src/config/limits.ts` centralizes default/override resolution so both `acquire()` (TTL) and `orchestrateCompose` (budget) read one source of truth — and FR-002's invariant (`maxHold > maxDuration + margin`) is asserted in exactly one place.

## Phase 0 — Research

See [research.md](./research.md). Decisions resolved:

- **R1** Reclaim trigger: `started_at` age vs max-hold TTL, applied even to live PIDs; dead-PID/unparseable reclaim preserved.
- **R2** Atomic acquire: `openSync(path, "wx")` (O_EXCL) + bounded reclaim-retry loop → exactly-one-winner under a reclaim race (closes the TOCTOU edge case).
- **R3** Bounded compose: `AbortController` + `Promise.race` around `runPipeline`; effective whenever the event loop still turns. Age-based reclaim is the backstop when it does not.
- **R4** Atomicity under abort: `signal.throwIfAborted()` at phase boundaries, **mandatory immediately before `commit`** — guarantees no half-written state even if a stuck `await` resolves post-timeout.
- **R5** Ownership identity = `(pid, started_at)`; `release()` verifies before unlink.
- **R6** Defaults & config surface: `maxComposeDurationMs` and `maxHoldMs` with `maxHold > maxDuration + margin`; defaults documented; `composer.json` `limits` block + env override.
- **R7** Clock skew: clamp age to `≥ 0`; a just-written lock is never stale.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — `LockData` (+ optional `expires_at`), ownership identity, `EffectiveLimits`.
- [contracts/workspace-lock.md](./contracts/workspace-lock.md) — `acquire()` / `release()` behavioral contract.
- [contracts/config-cli-mcp.md](./contracts/config-cli-mcp.md) — config keys, env overrides, `doctor` report shape, `--fix` / `--force`.
- [quickstart.md](./quickstart.md) — reproduce the wedge and verify self-heal.

**Post-design Constitution re-check**: PASS — design adds no agent-surface tool, preserves Atomic Compose via pre-commit abort checkpoint, and changes only human-owned config/CLI surfaces.

## Complexity Tracking

> No constitutional violations. No entries.
