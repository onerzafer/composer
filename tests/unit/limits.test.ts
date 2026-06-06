// 005 T003 — resolveLimits foundational unit tests (contracts/config-cli-mcp.md L1–L5).

import { describe, it, expect } from "vitest";
import {
  resolveLimits,
  DEFAULT_LIMITS,
  DEFAULT_MAX_COMPOSE_DURATION_MS,
  DEFAULT_MAX_HOLD_MS,
  ENV_MAX_COMPOSE_DURATION_MS,
  ENV_MAX_HOLD_MS,
  type ComposerConfig,
} from "@composer/core";

const cfg = (limits?: { maxComposeDurationMs?: number; maxHoldMs?: number }): ComposerConfig => ({
  workspace: "./design",
  engine: "@composer/typescript@1",
  ...(limits ? { limits } : {}),
});

describe("resolveLimits (005 foundational)", () => {
  it("L1: defaults when no config limits and no env", () => {
    const lim = resolveLimits(cfg(), {});
    expect(lim.maxComposeDurationMs).toBe(DEFAULT_MAX_COMPOSE_DURATION_MS);
    expect(lim.maxHoldMs).toBe(DEFAULT_MAX_HOLD_MS);
    expect(lim.ttlMarginMs).toBe(Math.floor(DEFAULT_MAX_COMPOSE_DURATION_MS / 2));
    expect(lim).toEqual(DEFAULT_LIMITS);
  });

  it("L2: composer.json limits override defaults (per field)", () => {
    // Override the budget; the TTL defaults. Invariant holds (default TTL >> 10000 + 5000).
    const lim = resolveLimits(cfg({ maxComposeDurationMs: 10_000 }), {});
    expect(lim.maxComposeDurationMs).toBe(10_000);
    expect(lim.maxHoldMs).toBe(DEFAULT_MAX_HOLD_MS);
  });

  it("L3: env overrides composer.json", () => {
    const lim = resolveLimits(cfg({ maxHoldMs: 90_000, maxComposeDurationMs: 40_000 }), {
      [ENV_MAX_HOLD_MS]: "120000",
    });
    expect(lim.maxHoldMs).toBe(120_000); // env wins
    expect(lim.maxComposeDurationMs).toBe(40_000); // config (no env for this field)
  });

  it("L4: invariant violation (maxHold < duration + ttlMargin) throws", () => {
    // With the default budget, 40000 < 120000 + 60000 = 180000 → invalid.
    expect(() => resolveLimits(cfg({ maxHoldMs: 40_000 }), {})).toThrow(/maxHoldMs/);
  });

  it("L5: non-integer / <= 0 env value throws", () => {
    expect(() => resolveLimits(cfg(), { [ENV_MAX_HOLD_MS]: "0" })).toThrow();
    expect(() => resolveLimits(cfg(), { [ENV_MAX_HOLD_MS]: "abc" })).toThrow();
    expect(() => resolveLimits(cfg(), { [ENV_MAX_COMPOSE_DURATION_MS]: "1.5" })).toThrow();
  });

  it("null/undefined config falls back to defaults", () => {
    expect(resolveLimits(null, {})).toEqual(DEFAULT_LIMITS);
    expect(resolveLimits(undefined, {})).toEqual(DEFAULT_LIMITS);
  });
});
