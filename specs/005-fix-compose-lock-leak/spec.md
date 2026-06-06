# Feature Specification: Fix compose lock-leak deadlock

**Feature Branch**: `005-fix-compose-lock-leak`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Fix Composer compose lock-leak deadlock: a hung compose holds the workspace lock forever after the MCP client times out, so every later compose fails with LOCK_HELD until the stuck process is killed by hand. The lock must self-heal."

## Context (observed failure)

A real wedge captured from a consumer (the `immortal` agent driving Composer over MCP):

1. `compose` for spec `weather-forecast` began at `2026-06-05T11:36:52Z` (surface `mcp`).
2. The MCP **client** gave up after its request timeout: `mcp call failed: timeout waiting for response to id 9`.
3. The Composer **server** process kept running, still inside `compose`, still holding the lock.
4. Every subsequent attempt failed: `LOCK_HELD: compose in progress (pid 30842, started 2026-06-05T11:36:52.687Z, surface mcp, spec weather-forecast)` — repeated indefinitely.
5. The holder process sat at 0% CPU for 30+ minutes (hung, not working) and **survived a restart of the consuming daemon** (it was a child/orphan still holding the on-disk lock).
6. The only recovery was a manual `kill` of the stuck PID. Nothing in Composer reclaimed the lock on its own.

### Root cause (current code)

- `packages/core/src/lock/workspace-lock.ts` → `withWorkspaceLock()` releases the lock only in a `finally` block. The wrapped compose body (`fn()`) is **unbounded** — if it hangs, `finally` never runs and the lock is never released.
- `WorkspaceLock.acquire()` treats a lock as stale **only when the recorded PID is dead** (`isProcessAlive` via `process.kill(pid, 0)`). The `started_at` timestamp is written into the lock but is **never consulted**, so an alive-but-stuck holder can hold the lock forever.
- The MCP surface's client-side timeout abandons the call but neither cancels the server-side compose nor releases the lock, leaving the consumer in a retry loop that can only ever see `LOCK_HELD`.

The lock file lives at `<workspaceRoot>/.composer/cache/compose.lock` (see `withWorkspaceLock` and `packages/cli/src/commands/doctor.ts` `runStaleLockReport`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A stuck compose self-heals; the next compose succeeds (Priority: P1)

An agent calls `compose`. That compose hangs (model stall, runaway render, deadlock — cause unknown). The agent's client times out and the agent retries. The retry must eventually succeed **without any human killing a process**, because the abandoned compose's lock is reclaimed automatically once it has clearly outlived a real compose.

**Why this priority**: This is the whole bug. Today a single hung compose bricks all future composes in the workspace until someone runs `kill` by hand. Self-healing is the minimum viable fix and restores the core "compose works" guarantee.

**Independent Test**: Acquire the lock with a `started_at` far in the past while a live PID still holds it; call `acquire()` again and confirm it reclaims (does not throw `LockHeldError`). End-to-end: simulate a compose that exceeds the max duration; confirm the lock is gone and a fresh `compose` returns a normal result.

**Acceptance Scenarios**:

1. **Given** a `compose.lock` whose `started_at` is older than the maximum-hold TTL and whose PID is still alive, **When** a new compose calls `acquire()`, **Then** the lock is reclaimed and compose proceeds (no `LockHeldError`).
2. **Given** a `compose.lock` whose `started_at` is within the TTL and whose PID is alive, **When** a new compose calls `acquire()`, **Then** it still fails fast with `LockHeldError` (a genuinely in-progress compose is NOT interrupted).
3. **Given** a compose whose body hangs past the maximum compose duration, **When** the duration is exceeded, **Then** the compose is aborted, the lock is released, and the caller receives a typed timeout error (not an indefinite hang).
4. **Given** the failure reproduced from Context above, **When** the agent retries after its client timeout, **Then** within one TTL window a retry succeeds with no manual intervention and no daemon restart.

---

### User Story 2 - Bounded compose: it can never hang forever (Priority: P2)

`compose` runs under a wall-clock budget. If it exceeds the budget it is cancelled, the lock released, and a clear timeout error returned — so the hang in Story 1 becomes rare in the first place rather than only being cleaned up after the fact.

**Why this priority**: Story 1 makes the lock self-heal; Story 2 attacks the upstream cause so the workspace isn't blocked for a whole TTL each time. Valuable but secondary to simply un-wedging.

**Independent Test**: Inject a compose body that sleeps beyond the budget; assert the call rejects with a typed timeout within budget + margin and that `compose.lock` no longer exists afterward.

**Acceptance Scenarios**:

1. **Given** a compose budget of N seconds, **When** the compose body runs longer than N, **Then** it is aborted with a typed `ComposeTimeout`-style error and the lock is released in the same teardown.
2. **Given** a compose that finishes well under budget, **When** it completes, **Then** behavior is unchanged (no added latency, lock released as today).

---

### User Story 3 - Operator can see and break a stuck lock (Priority: P3)

`doctor` already reports/reclaims dead-PID locks. Extend the operator surface so an age-exceeded (alive-but-stuck) lock is reported and can be force-broken, and document the one-liner — so even an exotic wedge has a fast, supported escape hatch.

**Why this priority**: A safety net for cases the automatic path doesn't cover (e.g. a holder stuck below the TTL that an operator knows is dead). Nice-to-have once P1/P2 land.

**Independent Test**: Run `doctor` against a workspace with an age-exceeded live-PID lock; confirm it is reported as reclaimable and that the documented fix command removes it.

**Acceptance Scenarios**:

1. **Given** a lock older than the TTL held by a live PID, **When** `doctor` runs, **Then** it reports the lock as stale/reclaimable (not merely "live lockfile") with the holder's pid, age, surface, and spec.
2. **Given** that report, **When** the operator runs the documented fix (e.g. `doctor --fix` or `compose --force`), **Then** the lock is removed and a subsequent compose succeeds.

---

### Edge Cases

- **Two composes race after a reclaim**: when a stale lock is reclaimed, exactly one new caller must win; the others must see `LockHeldError` against the *new* lock, not the reclaimed one. (Reclaim + write must not introduce a TOCTOU double-acquire.)
- **Clock skew / non-monotonic time**: `started_at` is wall-clock ISO 8601. TTL comparison must tolerate small skew and never treat a just-acquired lock as already stale.
- **Unparseable or partially written lock file**: already reclaimed today ("Stale or unparseable — reclaim"); preserve that behavior.
- **Orphaned holder after consumer restart**: the holder may be re-parented (PID still alive) — the age-based reclaim must work regardless of process lineage.
- **Permission-denied PID probe (EPERM)**: currently treated as alive; with age-based reclaim, an EPERM holder past TTL must still be reclaimable.
- **Release after reclaim**: if a slow holder finally finishes after its lock was reclaimed by someone else, its `release()` must not delete the *new* holder's lock. (Release should verify ownership before unlinking.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `WorkspaceLock.acquire()` MUST reclaim an existing lock when its `started_at` is older than a configurable maximum-hold TTL, **even if the recorded PID is alive**. Dead-PID reclaim MUST continue to work as today.
- **FR-002**: The maximum-hold TTL MUST be greater than the maximum allowed compose duration (FR-004) plus a safety margin, so a healthy long compose is never reclaimed out from under itself.
- **FR-003**: A genuinely in-progress compose (live PID, `started_at` within TTL) MUST still cause `acquire()` to fail fast with `LockHeldError` — concurrency protection is preserved.
- **FR-004**: `compose` (via `withWorkspaceLock` or its caller) MUST run under a bounded wall-clock budget. On exceeding the budget it MUST abort, release the lock, and surface a typed timeout error to the caller.
- **FR-005**: Lock release MUST run on every compose exit path including abort/timeout — releasing only in a `finally` around an unbounded body is insufficient (FR-004 provides the bound that makes `finally` reachable).
- **FR-006**: `release()` MUST only delete a lock file it still owns (e.g. matching pid + started_at). If the lock was reclaimed by another holder, release MUST be a no-op so it cannot delete the new holder's lock.
- **FR-007**: The maximum compose duration and the maximum-hold TTL MUST be configurable (with sensible defaults) so consumers can tune them; defaults MUST be documented.
- **FR-008**: The MCP surface MUST ensure that when compose ends in timeout/abort, the lock is released **before** the error is returned, so an immediate client retry does not observe `LOCK_HELD` for the abandoned call.
- **FR-009**: `doctor` MUST report an age-exceeded live-PID lock as stale/reclaimable (extending the existing dead-PID report) and MUST include the holder's pid, age, surface, and spec_id in its message.
- **FR-010**: There MUST be a supported, documented way for an operator to force-break a lock (e.g. `doctor --fix` and/or `compose --force`), used only as a last resort.
- **FR-011**: Recovering from a wedged compose MUST NOT require restarting the consuming process/daemon; reclaim happens at the Composer layer.

### Key Entities *(include if feature involves data)*

- **LockData** (`packages/core/src/lock/workspace-lock.ts`): `pid`, `started_at` (ISO 8601), `surface` (`mcp`|`cli`), `spec_id`. `started_at` becomes load-bearing for staleness; consider adding a TTL/`expires_at` or treating `started_at + maxHold` as the expiry. Ownership identity (for FR-006) is `(pid, started_at)`.
- **compose.lock file**: `<workspaceRoot>/.composer/cache/compose.lock`. Single whole-workspace lock guarding compose.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a compose hangs and is abandoned by the client, a retry succeeds automatically within one TTL window (target: ≤ 60s, configurable) with **zero** manual process kills.
- **SC-002**: No `LOCK_HELD` error persists longer than the configured maximum-hold TTL in any scenario.
- **SC-003**: A compose that exceeds its duration budget returns a typed timeout error within budget + margin (target margin ≤ 5s) and leaves **no** `compose.lock` behind.
- **SC-004**: A healthy in-progress compose is never interrupted: zero false reclaims for composes running within the TTL (verified by concurrency tests).
- **SC-005**: Recovering a wedged workspace requires zero restarts of the consuming daemon and zero manual filesystem edits in the automatic path.
- **SC-006**: 100% of compose exit paths (success, validation failure, abort, timeout, crash-of-body) end with the lock released or reclaimable.

## Assumptions

- The single whole-workspace `compose.lock` model is retained; this fixes its lifecycle, it does not redesign locking granularity.
- Wall-clock `started_at` (ISO 8601) is acceptable for TTL comparison; small clock skew is tolerated, not engineered around with a monotonic clock.
- A safe default maximum compose duration and a larger maximum-hold TTL exist and are documented; consumers (e.g. the MCP client's own request timeout) should be set consistent with these defaults so client and server timeouts don't fight.
- The fix lives entirely in Composer (`packages/core` lock + compose path, `packages/cli` doctor, the MCP surface). No change is required in consumers, though consumers benefit immediately.
- The existing dead-PID and unparseable-lock reclaim behaviors are correct and must be preserved.
