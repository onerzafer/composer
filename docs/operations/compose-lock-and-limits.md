# Compose lock lifecycle, budgets, and recovery

Composer guards `compose` with a single whole-workspace lock at
`<workspace>/.composer/cache/compose.lock`. As of feature **005** the lock
**self-heals**: a hung or abandoned compose can never wedge the workspace forever.

## The two tunables

| Name | Default | Meaning |
|------|---------|---------|
| `maxComposeDurationMs` | `120000` (120 s) | Wall-clock budget for a single compose. On exceed, the compose aborts, releases the lock, and returns a typed `COMPOSE_TIMEOUT` error. Generous by default so a cold catalog compile is never killed. |
| `maxHoldMs` | `180000` (180 s) | Lock TTL. An existing lock whose `started_at` is older than this is **reclaimed automatically** on the next acquire — even if the recorded PID is still alive (e.g. an orphaned, wedged holder). |

The defaults favour correctness (never abort a slow-but-legitimate compose) over recovery
speed. Where your composes are known to be fast and you want tighter self-heal — e.g. the
≤ 60 s recovery target — set `maxComposeDurationMs: 30000`, `maxHoldMs: 60000`.

**Invariant (enforced):** `maxHoldMs ≥ maxComposeDurationMs + ttlMarginMs`, where
`ttlMarginMs = floor(maxComposeDurationMs / 2)`. This guarantees a healthy long
compose is never reclaimed out from under itself. A config that violates it fails
fast with a `ComposerConfigError` at resolve time (not mid-compose).

> Note: `ttlMarginMs` is the **TTL safety gap** between the budget and the TTL. It is
> unrelated to how quickly the timeout *fires* after the budget is hit (that detection
> latency is typically sub-second).

## Configuring the limits

Per-project, in `composer.json`:

```jsonc
{
  "workspace": "./design",
  "engine": "@composer/typescript@1",
  "limits": {
    "maxComposeDurationMs": 120000,
    "maxHoldMs": 180000
  }
}
```

Both sub-fields are optional positive integers; omit either to take its default.

Per-invocation override (ops, no file edit) via environment variables — these take
precedence over `composer.json`:

```bash
COMPOSER_COMPOSE_MAX_DURATION_MS=45000 \
COMPOSER_LOCK_MAX_HOLD_MS=90000 \
composer compose my-spec
```

### Aligning a consuming client's timeout

If you drive Composer over MCP, set the MCP **client** request timeout consistent
with the server's `maxComposeDurationMs` so client and server timeouts don't fight:
let the server's budget fire first (return a typed `COMPOSE_TIMEOUT` with the lock
already released) rather than the client abandoning the call while the server keeps
running. After a server-side timeout, an immediate retry will **not** see `LOCK_HELD`.

## How recovery works

1. **Bounded compose** — every compose runs under `maxComposeDurationMs`. If it
   stalls (e.g. a loader deadlock), the budget fires, the lock is released, and the
   caller gets a `COMPOSE_TIMEOUT` error. Commit is a bounded, uninterruptible
   critical section: a timeout never interleaves with a real write, so compose stays
   atomic.
2. **Age-based reclaim** — even if a holder's event loop is so wedged its own timer
   can't fire, the **next** compose reclaims the lock once it is older than
   `maxHoldMs`. This is the hard guarantee; recovery needs no daemon restart and no
   manual filesystem edits.

## Operator escape hatches (last resort)

```bash
composer doctor                 # reports an age-stale, alive-PID lock as "reclaimable"
                                # (pid, age, surface, spec) — does not remove it
composer doctor --fix           # removes reclaimable locks (dead-PID, unparseable, age-stale)
composer compose <spec> --force # force-break a stuck lock, then compose
```

`doctor --fix` never removes a genuinely in-progress (within-TTL, alive) lock.
`--force` / `--fix` are CLI-only — there is no force escape hatch on the MCP agent
surface.
