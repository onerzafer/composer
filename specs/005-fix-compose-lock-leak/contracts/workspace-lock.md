# Contract: `WorkspaceLock` behavior

Behavioral contract for `packages/core/src/lock/workspace-lock.ts` after 005.
These are the assertions the unit tests in `tests/unit/workspace-lock.test.ts` MUST encode.

## Construction

```ts
new WorkspaceLock(lockPath: string, opts?: { maxHoldMs?: number; now?: () => number })
```
- `maxHoldMs` defaults to the resolved `EffectiveLimits.maxHoldMs`. Tests inject a small value (e.g. `50`).
- `now` is an injectable clock for deterministic age tests; defaults to `Date.now`.

## `acquire(input): LockData`

`input = { pid, surface, spec_id, started_at? }` (started_at defaults to `new Date(now()).toISOString()`).

| # | Given | When | Then |
|---|-------|------|------|
| A1 | no lock file | acquire | creates lock via `openSync(path,"wx")`; returns written `LockData`; `acquired = true` |
| A2 | lock with **dead** PID | acquire | reclaims (unlink + wx create); succeeds |
| A3 | lock **unparseable** | acquire | reclaims; succeeds |
| A4 | lock with **live** PID, `started_at` age **≤ maxHoldMs** | acquire | throws `LockHeldError` (carries existing `LockData`); on-disk lock untouched |
| A5 | lock with **live** PID, `started_at` age **> maxHoldMs** | acquire | reclaims; succeeds (FR-001) |
| A6 | lock with **live** PID, age **> maxHoldMs**, but **EPERM** on probe | acquire | reclaims (age branch independent of liveness) |
| A7 | two acquirers race on a reclaimable lock | both acquire | exactly one succeeds; the other throws `LockHeldError` against the **new** lock, never against the reclaimed one (FR-003 edge) |
| A8 | age is **negative** (clock skew) or ~0 | acquire | treated as fresh → A4 path (never reclaimed) (R7) |

Implementation notes (normative):
- Acquire is a bounded retry loop (≤ 5) of: `openSync(path,"wx")` → on `EEXIST`, `tryRead` + `isReclaimable`; reclaim (`unlink`) and retry, else throw `LockHeldError`.
- After success, record ownership identity `(pid, started_at)` on the instance.
- Writes go through the `wx` fd then close; directory is `mkdir -p`'d first (preserved).

## `release(): void`

| # | Given | When | Then |
|---|-------|------|------|
| R1 | this instance holds the lock, on-disk identity matches | release | unlinks the lock file; `acquired = false` |
| R2 | the lock was reclaimed by another holder (on-disk `(pid,started_at)` differs) | release | **no-op** — does not unlink the new holder's lock (FR-006) |
| R3 | lock file already absent | release | no-op, no throw |
| R4 | never acquired | release | no-op (preserved) |

Release is best-effort on I/O errors (swallow), as today — but the **identity check happens first** and gates the unlink.

## `withWorkspaceLock(workspaceRoot, input, fn)`

Convenience wrapper kept for parity. After 005 it MUST use the same ownership-checked `release()` in `finally`. (The production compose path is `orchestrateCompose`, which manages the lock directly; `withWorkspaceLock` is updated for consistency so no caller can reintroduce the unconditional-unlink bug.)

## Non-goals

- No change to the lock file path or to the single-whole-workspace model.
- No heartbeat, no monotonic clock, no cross-host coordination.
