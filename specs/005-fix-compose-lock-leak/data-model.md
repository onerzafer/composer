# Data Model: Fix compose lock-leak deadlock

Entities and their evolution. No database — state is one JSON lock file plus config. Sources:
`packages/core/src/lock/workspace-lock.ts`, `packages/core/src/workspace/validate-config.ts`.

---

## LockData (on-disk: `<workspaceRoot>/.composer/cache/compose.lock`)

| Field | Type | Status | Notes |
|-------|------|--------|-------|
| `pid` | `number` | existing | Holder process id. Used for liveness (`process.kill(pid, 0)`). |
| `started_at` | `string` (ISO 8601) | existing → **load-bearing** | Now read for age-based staleness (R1) and as half of the ownership identity (R5). |
| `surface` | `"mcp" \| "cli"` | existing | Reported by `doctor`. |
| `spec_id` | `string` | existing | Reported by `doctor`. |
| `expires_at` | `string` (ISO 8601) | **optional, new** | Convenience = `started_at + maxHoldMs` at write time. Advisory only; the authoritative check recomputes age from `started_at` against the *reader's* effective `maxHoldMs` (so a config change takes effect without rewriting live locks). May be added for human/`doctor` readability; not required for correctness. |

**Validation (`tryRead`)** unchanged in spirit: a record is valid iff `pid:number`, `started_at:string`, `surface ∈ {mcp,cli}`. Invalid/unparseable → reclaimable (preserved).

**Ownership identity** = `(pid, started_at)`. Held in-memory by the `WorkspaceLock` instance after a successful acquire. `release()` unlinks only when the on-disk identity equals the recorded one.

**Staleness predicate** (pure, testable):
```
isReclaimable(existing, now, maxHoldMs):
  existing == null            → true   # unparseable
  !isProcessAlive(existing.pid) → true # dead PID
  age = max(0, now - Date.parse(existing.started_at))
  return age > maxHoldMs               # age-stale even if alive (R1, R7)
```
`isProcessAlive` keeps EPERM-as-alive; an EPERM holder past TTL is still reclaimed because the age branch is independent of liveness.

---

## EffectiveLimits (in-memory; `core/src/config/limits.ts`, new)

| Field | Type | Default | Constraint |
|-------|------|---------|------------|
| `maxComposeDurationMs` | `number` (int > 0) | `30_000` | wall-clock budget for the whole pipeline (R3) |
| `maxHoldMs` | `number` (int > 0) | `60_000` | lock TTL for age-based reclaim (R1) |
| `marginMs` | `number` (int ≥ 0) | `maxComposeDurationMs / 2` | derived; enforces the gap |

**Invariant (asserted at resolve time)**: `maxHoldMs ≥ maxComposeDurationMs + marginMs`. Violation → `ComposerConfigError` before any compose runs (fail fast).

**Resolution precedence** (first present wins, per field):
1. env: `COMPOSER_COMPOSE_MAX_DURATION_MS`, `COMPOSER_LOCK_MAX_HOLD_MS`
2. `composer.json` → `limits: { maxComposeDurationMs?, maxHoldMs? }`
3. built-in defaults above

---

## ComposerConfig (extended; `composer.json`)

Add one optional key to the existing strict validator (`ALLOWED_KEYS`, `validateComposerConfig`):

```jsonc
{
  "workspace": "./design",
  "engine": "@composer/typescript@1",
  "limits": {                      // NEW — optional
    "maxComposeDurationMs": 30000, // int > 0, optional
    "maxHoldMs": 60000             // int > 0, optional
  }
}
```

Validation rules for `limits` (mirroring the existing field-issue style):
- must be an object if present;
- each sub-field, if present, an integer `> 0`;
- unknown sub-keys rejected;
- the cross-field invariant is checked in `limits.ts` (not the schema), so the error message can reference both values and the active env overrides.

JSON-Schema source-of-truth updated: `specs/001-composer-toolkit-v0/contracts/composer-json.schema.json`.

---

## Error types

| Type | Location | Code/Name | When |
|------|----------|-----------|------|
| `LockHeldError` | `core/src/lock/workspace-lock.ts` | `LockHeldError` (existing) | live PID, age ≤ TTL — fail fast |
| `LockHeldExposedError` | `core/src/pipeline/orchestrator.ts` | `code: "LOCK_HELD"` (existing) | maps `LockHeldError` to the public surface |
| `ComposeTimeoutError` | `core/src/pipeline/orchestrator.ts` (**new**) | `code: "COMPOSE_TIMEOUT"` | budget exceeded (R3); carries `durationMs`, `specId`, `surface` |

`ComposeTimeoutError` is exported from `@composer/core` and gets a CLI exit code (next free in the `compose.ts` table — code `9`) and a typed MCP error string.

---

## State transitions (the lock, per acquisition)

```
absent ──acquire(wx ok)──▶ held(pid,started_at)
absent ──acquire, EEXIST & reclaimable──▶ unlink ─▶ retry wx ─▶ held (this caller) | EEXIST ─▶ LockHeldError(new)
held   ──acquire by other, age≤TTL──▶ LockHeldError (no transition)
held   ──acquire by other, age>TTL or dead PID──▶ reclaimed ─▶ held(new identity)
held   ──release(), identity matches──▶ absent
held   ──release(), identity mismatch (was reclaimed)──▶ no-op (stays as new holder's)
held   ──compose budget exceeded──▶ (abort) ─▶ release(owned) ─▶ absent ; ComposeTimeoutError thrown
```
