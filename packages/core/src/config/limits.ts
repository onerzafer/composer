// 005 — Effective compose/lock limits (single source of truth).
//
// Two tunables bound the compose lifecycle:
//   • maxComposeDurationMs — wall-clock budget for a single compose (FR-004).
//   • maxHoldMs            — lock TTL after which an age-stale lock is reclaimed (FR-001),
//                            even if its recorded PID is alive.
// The FR-002 invariant `maxHoldMs >= maxComposeDurationMs + ttlMarginMs` is asserted
// here, once, so a healthy long compose is never reclaimed out from under itself.
//
// Resolution precedence per field: env var > composer.json `limits` > built-in default.

import { ComposerConfigError, type ComposerConfig } from "../workspace/validate-config.js";

export interface EffectiveLimits {
  /** Wall-clock budget for a single compose (ms). */
  maxComposeDurationMs: number;
  /** Lock TTL: an existing lock older than this is reclaimable even if its PID is alive (ms). */
  maxHoldMs: number;
  /**
   * Derived TTL safety gap between the budget and the TTL (ms). This is the FR-002
   * margin — NOT SC-003's timeout-detection margin (how soon after the budget the
   * abort fires). The two were both called "margin" in the spec; we keep them distinct.
   */
  ttlMarginMs: number;
}

// Defaults favour never killing a legitimate compose: a cold catalog compile (e.g.
// adapter-next via the tsx loader on a fresh workspace) can take tens of seconds, so the
// budget is generous. Tune both down (e.g. 30s/60s) where composes are known to be fast
// and tighter recovery is wanted. The invariant maxHold >= duration + duration/2 holds.
export const DEFAULT_MAX_COMPOSE_DURATION_MS = 120_000;
export const DEFAULT_MAX_HOLD_MS = 180_000;

/** Env overrides (ops can tune without editing composer.json). */
export const ENV_MAX_COMPOSE_DURATION_MS = "COMPOSER_COMPOSE_MAX_DURATION_MS";
export const ENV_MAX_HOLD_MS = "COMPOSER_LOCK_MAX_HOLD_MS";

const ttlMargin = (durationMs: number): number => Math.floor(durationMs / 2);

export const DEFAULT_LIMITS: EffectiveLimits = {
  maxComposeDurationMs: DEFAULT_MAX_COMPOSE_DURATION_MS,
  maxHoldMs: DEFAULT_MAX_HOLD_MS,
  ttlMarginMs: ttlMargin(DEFAULT_MAX_COMPOSE_DURATION_MS),
};

function parseEnvInt(raw: string | undefined, key: string): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ComposerConfigError(`${key} must be a positive integer (got "${raw}")`);
  }
  return n;
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ComposerConfigError(
      `compose limits: ${label} must be a positive integer (got ${value})`,
    );
  }
}

/**
 * Resolve the effective compose/lock limits for a workspace.
 * Pass the already-parsed `composer.json` config (from `resolveWorkspace`) to avoid
 * a second file read; `null`/`undefined` falls back to defaults. Throws
 * `ComposerConfigError` on an invalid env value or a violated FR-002 invariant.
 */
export function resolveLimits(
  config?: ComposerConfig | null,
  env: NodeJS.ProcessEnv = process.env,
): EffectiveLimits {
  const cfg = config?.limits ?? {};

  const maxComposeDurationMs =
    parseEnvInt(env[ENV_MAX_COMPOSE_DURATION_MS], ENV_MAX_COMPOSE_DURATION_MS) ??
    cfg.maxComposeDurationMs ??
    DEFAULT_MAX_COMPOSE_DURATION_MS;

  const maxHoldMs =
    parseEnvInt(env[ENV_MAX_HOLD_MS], ENV_MAX_HOLD_MS) ?? cfg.maxHoldMs ?? DEFAULT_MAX_HOLD_MS;

  assertPositiveInt(maxComposeDurationMs, "maxComposeDurationMs");
  assertPositiveInt(maxHoldMs, "maxHoldMs");

  const ttlMarginMs = ttlMargin(maxComposeDurationMs);

  if (maxHoldMs < maxComposeDurationMs + ttlMarginMs) {
    throw new ComposerConfigError(
      `compose limits invalid: maxHoldMs (${maxHoldMs}) must be >= maxComposeDurationMs ` +
        `(${maxComposeDurationMs}) + ttlMarginMs (${ttlMarginMs}). ` +
        `Adjust composer.json "limits" or env ${ENV_MAX_COMPOSE_DURATION_MS}/${ENV_MAX_HOLD_MS}.`,
    );
  }

  return { maxComposeDurationMs, maxHoldMs, ttlMarginMs };
}
