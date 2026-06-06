# Research: Fix compose lock-leak deadlock

Phase 0 decisions. Each resolves a design unknown surfaced by the spec. Grounded in the current code:
`packages/core/src/lock/workspace-lock.ts`, `packages/core/src/pipeline/orchestrator.ts`,
`packages/cli/src/commands/doctor.ts`, `packages/core/src/workspace/validate-config.ts`.

---

## R1 — Reclaim trigger: age vs. max-hold TTL (FR-001/002/003)

**Decision**: `acquire()` reclaims an existing lock when **any** of these hold:
1. the lock file is unparseable (already today),
2. the recorded PID is dead (already today), or
3. **new** — the recorded `started_at` is older than `maxHoldMs` (age-based), regardless of PID liveness.

Otherwise (live PID **and** age ≤ `maxHoldMs`) it throws `LockHeldError` — a real in-progress compose is never interrupted.

**Rationale**: The observed wedge is a *live* PID (0% CPU, survived a daemon restart as an orphan). PID-liveness alone can never reclaim it. `started_at` is already written into the lock but never read; making it load-bearing is the minimal change that covers the "alive-but-stuck" and "EPERM holder past TTL" cases. Age is the only signal that distinguishes a healthy long compose from a dead one without cooperation from the (wedged) holder.

**Alternatives considered**:
- *Heartbeat / liveness file the holder must touch*: requires the holder to keep running code — exactly what a wedged holder cannot do. Rejected.
- *Shorten to dead-PID only + rely on the consumer to kill the PID*: that is today's behavior and the bug. Rejected.

---

## R2 — Atomic acquire & the reclaim race (Edge case: "two composes race after a reclaim")

**Decision**: Replace `existsSync` check-then-`writeFileSync` with an **O_EXCL create**:
`openSync(lockPath, "wx")`. On `EEXIST`, read the existing lock and decide reclaimability (R1). If reclaimable, `unlinkSync` it and **retry** the `wx` create (bounded loop, e.g. ≤ 5 attempts). If not reclaimable, throw `LockHeldError` against the existing lock.

Under a race, two callers that both judge the lock stale will both `unlink` + `open("wx")`, but the OS guarantees exactly **one** `wx` create succeeds; the loser gets `EEXIST`, re-reads, finds the *new* (fresh) lock, and throws `LockHeldError` against it — precisely the spec's required behavior ("exactly one new caller must win; the others must see `LockHeldError` against the *new* lock").

**Rationale**: O_EXCL is the standard cross-process mutual-exclusion primitive on a local filesystem and removes the current TOCTOU window. Writes go through the returned fd, then close.

**Alternatives considered**:
- *`renameSync` of a temp file into place*: atomic for the write, but does not provide exclusive *creation* — two reclaimers can both rename. Rejected.
- *`proper-lockfile` / `flock` dependency*: new dependency, more moving parts than a single-host whole-workspace lock needs. Rejected (constitution favors minimal deps; FR scope is lifecycle, not granularity).

**Caveat documented**: O_EXCL is unreliable on some network filesystems; Composer's lock is a local `.composer/cache` file, so this is acceptable and noted.

---

## R3 — Bounding the compose (FR-004/005/008)

**Decision**: In `orchestrateCompose`, create an `AbortController`, arm a `setTimeout(maxComposeDurationMs)` that calls `controller.abort(new ComposeTimeoutError(...))`, and run `Promise.race([runPipeline(signal), abortPromise])`. The timer is created with `.unref()` so it never keeps the process alive, and is `clearTimeout`-ed in `finally`. On abort the function throws `ComposeTimeoutError`; the existing `finally` releases the lock (now ownership-checked, R5) **before** the error propagates to the CLI/MCP caller — satisfying FR-008 (an immediate client retry won't see `LOCK_HELD` for the abandoned call).

**Effectiveness boundary (explicit)**: `Promise.race` can only fire while the **event loop is still turning**. The observed failure (0% CPU, await-deadlock in the `tsx` loader) is exactly that case — the timer fires, the race rejects, the lock releases. If a future hang instead *blocks the event loop synchronously* (CPU spin or a synchronous native stall), the in-process timer cannot fire; recovery then falls to R1's age-based reclaim performed by **the next process**. The two mechanisms are deliberately layered: R3 bounds the common case fast and in-process; R1 is the unconditional guarantee.

**Rationale**: Node cannot forcibly cancel an in-flight `await`, but it does not need to — releasing the lock and returning a typed error is enough to un-wedge the workspace, and R4 stops the orphaned work from ever committing.

**Alternatives considered**:
- *Run compose in a worker thread / child process and kill it on timeout*: true preemption, but a large architectural change (serialize catalog/spec across the boundary, lose the in-process tsx module cache that today's `AUDIT_MODULE_CACHE` workaround relies on). Out of scope for a lock-lifecycle fix; recorded as a possible v0.2 follow-up if synchronous hangs ever appear.

---

## R4 — Atomicity under abort (Constitution III — load-bearing)

**Decision**: Thread the `AbortSignal` into `runPipeline` and call `signal.throwIfAborted()` at each phase boundary, **mandatorily immediately before the `commit` phase** (the only phase that mutates the workspace/outputs). If the budget expires while a stuck `await` is parked, the race already rejected and the lock is released; if that `await` *later* resolves and the pipeline resumes, the pre-commit `throwIfAborted()` makes it throw instead of writing — so there is **no half-written spec and no half-emitted file**, preserving Atomic Compose.

**Rationale**: The dangerous scenario is a "zombie" compose that wakes up after its lock was reclaimed and writes files underneath a newer compose. The pre-commit checkpoint plus R5's ownership-checked release together neutralize it: it won't commit, and its `release()` is a no-op against the new holder's lock.

**Verification**: extend `tests/integration/atomic-rollback.test.ts` with a hang-injection case asserting byte-identical tree + no lock + no commit.

---

## R5 — Ownership-checked release (FR-006; Edge case: "release after reclaim")

**Decision**: `WorkspaceLock` records the identity it wrote — `(pid, started_at)`. `release()` reads the current lock file and unlinks **only** if the on-disk `(pid, started_at)` matches the recorded identity. Mismatch (or missing file) → no-op. Identity is `(pid, started_at)` because `started_at` is unique per acquisition even for the same PID across sequential composes.

**Rationale**: After R1 reclaim, the original slow holder must not delete the new holder's lock. Comparing identity before unlink is the precise guard.

**Alternatives considered**: a random nonce/token field in `LockData`. Slightly stronger uniqueness but `(pid, started_at)` is already present and sufficient for a single-host lock; avoid widening the schema unnecessarily. Recorded as optional hardening.

---

## R6 — Defaults, invariant, and config surface (FR-007/002)

**Decision**:
- Two tunables: `maxComposeDurationMs` (R3 budget) and `maxHoldMs` (R1 TTL).
- **Invariant** asserted once in `core/src/config/limits.ts`: `maxHoldMs ≥ maxComposeDurationMs + marginMs` (default `marginMs = maxComposeDurationMs / 2`, floor of a few seconds). If a user config violates it, raise a clear `ComposerConfigError` (fail fast at resolve time, not mid-compose).
- **Defaults**: `maxComposeDurationMs = 30_000`, `maxHoldMs = 60_000`. A normal compose is sub-second (render sandbox is 1 s per template); 30 s is >30× headroom for a cold `tsx` catalog load, and a 60 s TTL meets SC-001's "retry succeeds within one TTL window (target ≤ 60 s)". Both are documented as conservative and tunable down for tighter recovery or up for very large catalogs.
- **Resolution order** (highest precedence first): env var → `composer.json` `limits` block → built-in default. Env vars: `COMPOSER_COMPOSE_MAX_DURATION_MS`, `COMPOSER_LOCK_MAX_HOLD_MS` (ops override without editing the project file).
- **`composer.json`**: add an optional `limits` object to `ComposerConfig` / `ALLOWED_KEYS`, validated like the existing fields (positive integers). Schema source-of-truth `specs/001-composer-toolkit-v0/contracts/composer-json.schema.json` updated in lockstep.

**Rationale**: One resolver keeps the FR-002 invariant in a single place and lets tests inject millisecond budgets. Env override is the ops-friendly path for the MCP consumer to align its own client timeout with the server budget (the spec's "client and server timeouts don't fight" assumption).

**Alternatives considered**: function-argument-only config (no persistence — consumers couldn't set it once); a whole new config file (redundant with `composer.json`). Both rejected.

---

## R7 — Clock skew & monotonicity (Edge case: "clock skew / non-monotonic time")

**Decision**: age `= max(0, Date.now() − Date.parse(started_at))`. A negative or near-zero age (just-written, or a backwards clock jump) is treated as **fresh**, never stale. TTL comparison is `age > maxHoldMs`. No monotonic clock is engineered — the spec explicitly accepts wall-clock with small-skew tolerance.

**Rationale**: Prevents a just-acquired lock from being reclaimed out from under a live compose due to skew between two machines/processes writing/reading wall-clock time, while keeping the simple ISO-8601 `started_at` already in the schema.

---

## Open follow-ups (not in scope for 005)

- Worker/child-process preemption for *synchronous* hangs (R3 boundary) — only if such a hang is ever observed.
- Root-cause fix for the underlying `tsx`-loader deadlock that today's `AUDIT_MODULE_CACHE` only sidesteps — tracked separately; 005 makes the lock survive it regardless.
