# Contract: config, orchestrator budget, doctor, CLI/MCP surfaces

Behavioral contract for the non-lock surfaces touched by 005.

## 1. Effective limits resolution (`core/src/config/limits.ts`, new)

```ts
resolveLimits(projectRoot: string, env = process.env): EffectiveLimits
```

| # | Given | Then |
|---|-------|------|
| L1 | no `limits` in `composer.json`, no env | returns defaults `{ maxComposeDurationMs: 30000, maxHoldMs: 60000 }` |
| L2 | `composer.json.limits.maxHoldMs = 90000` | overrides that field; other field defaulted |
| L3 | env `COMPOSER_LOCK_MAX_HOLD_MS=120000` set | env wins over `composer.json` for that field |
| L4 | resolved `maxHoldMs < maxComposeDurationMs + ttlMarginMs` | throws `ComposerConfigError` naming both values + any active env override |
| L5 | a tunable is non-integer / ≤ 0 (config or env) | throws `ComposerConfigError` |

`ttlMarginMs = floor(maxComposeDurationMs / 2)` by default.

## 2. Bounded compose (`core/src/pipeline/orchestrator.ts`)

| # | Given | When | Then |
|---|-------|------|------|
| O1 | pipeline body completes < budget | compose | unchanged result; timer cleared; lock released; **no added latency** |
| O2 | pipeline body exceeds `maxComposeDurationMs` (await-stall) | compose | rejects with `ComposeTimeoutError` (`code:"COMPOSE_TIMEOUT"`); lock **already released** before reject (FR-008) |
| O3 | budget expires, stuck `await` later resolves | — | pre-`commit` `throwIfAborted()` fires → **nothing committed**; tree byte-identical (Constitution III) |
| O4 | compose throws a normal pipeline error before budget | compose | existing typed error (structural/semantic/audit/render/drift); lock released; timer cleared |
| O5 | budget would expire *during* `commit` | compose | timer already disarmed before `commit` → commit completes normally and returns **success**; no `ComposeTimeoutError` for an actually-committed compose (Atomic Compose, analyze U1) |

Normative: arm `setTimeout(...).unref()`, `clearTimeout` in `finally`, `Promise.race([runPipeline(signal), abortPromise])`, `signal.throwIfAborted()` at each phase boundary and mandatorily immediately before `commit` — **then disarm the timer (`clearTimeout`) and detach the race immediately before `commit` so a timeout cannot interleave with the atomic commit (commit is a bounded, uninterruptible critical section).**

## 3. `doctor` stale-lock report (`cli/src/commands/doctor.ts`)

`runStaleLockReport` gains age-awareness (reads `started_at`, uses resolved `maxHoldMs`):

| # | Given lock state | `doctor` (no flag) reports | `doctor --fix` does |
|---|------------------|-----------------------------|---------------------|
| D1 | no lock file | `info: no lockfile present` (preserved) | nothing |
| D2 | unparseable | `warn: unparseable … — removed` (preserved auto-remove) | — already removed |
| D3 | dead PID | `warn: stale lockfile reclaimed (dead PID …)` (preserved auto-remove) | — already removed |
| D4 | **live PID, age > maxHoldMs** | `warn: reclaimable stale lock` incl. **pid, age, surface, spec_id** (FR-009); **not** auto-removed | removes the lock file |
| D5 | live PID, age ≤ maxHoldMs | `info: live lockfile (PID …, age …, spec …)` — a real in-progress compose, untouched | nothing |

`--fix` removes only reclaimable locks (D2/D3 already gone; D4 removed). It never removes a within-TTL live lock (D5).

## 4. `compose --force` (`cli/src/bin.ts` + `commands/compose.ts`)

| # | Given | When | Then |
|---|-------|------|------|
| C1 | a lock is held (any state) | `composer compose <id> --force` | force-breaks the existing lock (unlink) before acquiring, then composes normally |
| C2 | no lock held | `--force` | identical to a normal compose (no-op force) |

`--force` is **CLI-only** (humans). It is NOT added to the MCP `compose` tool (Constitution IV — no escape hatch on the agent surface). Documented as a last resort.

## 5. MCP `compose` tool (`mcp/src/tools/compose.ts`)

| # | Given | Then |
|---|-------|------|
| M1 | compose succeeds | unchanged result JSON |
| M2 | compose hits budget | tool returns an **error** result (`isError: true`) carrying the typed `COMPOSE_TIMEOUT` message; the workspace lock is already released, so an **immediate retry does not see `LOCK_HELD`** (FR-008, SC-001) |
| M3 | a genuinely concurrent compose is in progress (within TTL) | retry still returns `LOCK_HELD` (concurrency preserved, FR-003) |

No new tool, no new field on the agent surface beyond the error text/code.

## 6. Documentation (`docs/`)

Document: default `maxComposeDurationMs`/`maxHoldMs`, the `composer.json` `limits` block, the two env vars, the FR-002 invariant, and the operator force-break one-liners (`composer doctor --fix`, `composer compose <id> --force`). Note the consumer guidance: set the MCP client request timeout consistent with the server budget so client and server timeouts don't fight (spec Assumption).
