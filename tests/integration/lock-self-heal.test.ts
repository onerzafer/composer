// 005 T009 — End-to-end lock self-heal (US1 / FR-001/003/011, SC-001/002/005).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

const HERO = { primitive: "Hero", id: "hero1", title: "Hello" };

function writeLock(projectRoot: string, startedAtMs: number, pid: number): void {
  const cache = join(projectRoot, ".composer", "cache");
  mkdirSync(cache, { recursive: true });
  writeFileSync(
    join(cache, "compose.lock"),
    JSON.stringify(
      {
        pid,
        started_at: new Date(startedAtMs).toISOString(),
        surface: "mcp",
        spec_id: "weather-forecast",
      },
      null,
      2,
    ),
  );
}

const lockPath = (projectRoot: string) =>
  join(projectRoot, ".composer", "cache", "compose.lock");

describe("compose lock self-heal (005 US1)", () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = makeFixture({
      files: {
        "catalog/index.ts": STUB_CATALOG_INDEX,
        "templates/hero.ts.hbs": STUB_HERO_TEMPLATE,
        "output.map.ts": STUB_OUTPUT_MAP,
      },
    });
  });
  afterEach(() => fx.cleanup());

  it("reclaims an age-stale live-PID lock and composes — no manual kill (SC-001/002)", async () => {
    const { compose } = await import("@composer/core");
    // This process is alive; started 10 minutes ago → far past the default 60s TTL.
    writeLock(fx.workspaceRoot, Date.now() - 10 * 60_000, process.pid);

    const result = await compose(fx.projectRoot, "hero1", HERO);

    expect(result.files_written.length).toBeGreaterThan(0);
    // Lock released after a successful compose.
    expect(existsSync(lockPath(fx.workspaceRoot))).toBe(false);
  });

  it("reclaims regardless of holder lineage — orphaned/re-parented live PID (FR-011)", async () => {
    const { compose } = await import("@composer/core");
    // PID 1 (init) is always alive but is NOT our process — stands in for an orphaned
    // holder that survived a consumer restart. Age-based reclaim is lineage-independent.
    writeLock(fx.workspaceRoot, Date.now() - 10 * 60_000, 1);

    const result = await compose(fx.projectRoot, "hero1", HERO);
    expect(result.files_written.length).toBeGreaterThan(0);
  });

  it("does NOT reclaim a fresh within-TTL lock — LOCK_HELD preserved (FR-003/SC-004)", async () => {
    const { compose, LockHeldExposedError } = await import("@composer/core");
    writeLock(fx.workspaceRoot, Date.now(), process.pid); // fresh, alive

    await expect(compose(fx.projectRoot, "hero1", HERO)).rejects.toBeInstanceOf(
      LockHeldExposedError,
    );
    // The genuine holder's lock is untouched (ownership-checked release never ran).
    expect(existsSync(lockPath(fx.workspaceRoot))).toBe(true);
  });
});
