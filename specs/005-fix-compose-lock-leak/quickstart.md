# Quickstart: verifying the compose lock self-heal

How to reproduce the wedge and confirm the 005 fix. Assumes `pnpm -r build` is green.

## 0. Build & test

```bash
pnpm -r build
pnpm test            # vitest run — all suites green, incl. the new lock/timeout tests
```

New/changed tests that encode the fix:
- `tests/unit/workspace-lock.test.ts` — age reclaim, within-TTL hold, O_EXCL race, ownership release.
- `tests/integration/compose-timeout.test.ts` — hung body → `ComposeTimeoutError`, lock gone, nothing committed.
- `tests/integration/lock-self-heal.test.ts` — reproduces the spec wedge; a retry succeeds within one TTL with no kill.
- `tests/integration/doctor-stale-lock.test.ts` — age-stale live-PID lock reported; `--fix` removes it.
- `tests/integration/atomic-rollback.test.ts` — timeout-injection rollback case.

> Tests inject millisecond budgets (e.g. `maxComposeDurationMs: 50`, `maxHoldMs: 100`) so they finish well under vitest's 30 s `testTimeout`.

## 1. Reproduce the original wedge (pre-fix behavior, for understanding)

A stale lock with a **live** PID and an old `started_at`:

```bash
# in a composer workspace
mkdir -p .composer/cache
cat > .composer/cache/compose.lock <<JSON
{ "pid": $$, "started_at": "2000-01-01T00:00:00.000Z", "surface": "mcp", "spec_id": "weather-forecast" }
JSON
```

- **Before 005**: `composer compose weather-forecast` → `LOCK_HELD` forever (PID `$$` is alive). Only a manual delete recovers.
- **After 005**: the same compose **reclaims** the lock (age ≫ `maxHoldMs`) and proceeds. ✅ SC-001/SC-002.

## 2. Confirm a healthy in-progress compose is still protected

With a **fresh** `started_at` (now) and a live PID, a second compose must still fail fast:

```bash
# started_at = now, pid alive → within TTL
node -e 'const fs=require("fs");fs.mkdirSync(".composer/cache",{recursive:true});fs.writeFileSync(".composer/cache/compose.lock",JSON.stringify({pid:process.pid,started_at:new Date().toISOString(),surface:"cli",spec_id:"x"}))'
composer compose x      # → LOCK_HELD (correct: no false reclaim) ✅ SC-004
```

## 3. Bounded compose returns a typed timeout

Drive the budget low and inject a stall (in tests, via an injected hanging phase). Expected: a `COMPOSE_TIMEOUT` error within `budget + margin`, and **no `compose.lock` left behind**:

```bash
COMPOSER_COMPOSE_MAX_DURATION_MS=200 COMPOSER_LOCK_MAX_HOLD_MS=400 composer compose <hanging-spec>
# → exits non-zero with a COMPOSE_TIMEOUT message; .composer/cache/compose.lock is gone  ✅ SC-003
test ! -f .composer/cache/compose.lock && echo "lock released"
```

## 4. Operator escape hatches

```bash
composer doctor                 # reports an age-stale live-PID lock as "reclaimable" (pid, age, surface, spec)
composer doctor --fix           # removes reclaimable locks
composer compose <id> --force   # force-break then compose (last resort)
```

## 5. End-to-end (MCP) — the real consumer path

Through the MCP `compose` tool: a stalled call returns a typed timeout error **with the lock already released**, so the agent's immediate retry succeeds — no daemon restart, no manual `kill`:

```
compose(weather-forecast)  → COMPOSE_TIMEOUT (lock released)
compose(weather-forecast)  → ok   ✅ SC-001, SC-005, FR-008
```

## Success criteria mapping

| Check | SC |
|-------|----|
| §1 retry self-heals, zero kills | SC-001, SC-002, SC-005 |
| §3 typed timeout, no lock left | SC-003 |
| §2 no false reclaim within TTL | SC-004 |
| every exit path releases/reclaims | SC-006 |
