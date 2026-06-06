// 005 T014 — Bounded compose: a hung compose self-terminates with a typed timeout,
// leaves no lock, and commits nothing (US2 / FR-004/005, SC-003; contract O2).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  makeFixture,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";

// A catalog whose module evaluation hangs (top-level await on an unref'd timer, so it
// never keeps the process alive). The compile-catalog phase awaits this import and so
// blows the budget — exercising the abort/race path before any mutation.
const HANGING_CATALOG = `import { z } from "zod";
await new Promise((r) => { const t = setTimeout(r, 60000); if (t && typeof t.unref === "function") t.unref(); });
export const Hero = z.object({ primitive: z.literal("Hero"), id: z.string(), title: z.string().min(1) }).strict();
export const HeroMeta = { primitive: "Hero", version: "1.0.0", intent: "x", whenToUse: "x", whenNotToUse: [], fieldGuidance: {}, examples: [{ primitive: "Hero", id: "demo", title: "x" }] };
export const PrimitiveNode = z.discriminatedUnion("primitive", [Hero]);
`;

// Budget 300ms, TTL 600ms (satisfies maxHold >= duration + ttlMargin = 300 + 150).
const LIMITS = { maxComposeDurationMs: 300, maxHoldMs: 600 };

describe("bounded compose — timeout (005 US2)", () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = makeFixture({
      composerJson: {
        workspace: "./design",
        engine: "@composer/typescript@1",
        limits: LIMITS,
      },
      files: {
        "catalog/index.ts": HANGING_CATALOG,
        "templates/hero.ts.hbs": STUB_HERO_TEMPLATE,
        "output.map.ts": STUB_OUTPUT_MAP,
      },
    });
  });
  afterEach(() => fx.cleanup());

  it("exceeds budget → COMPOSE_TIMEOUT, no lock left, nothing committed (SC-003)", async () => {
    const { compose, ComposeTimeoutError } = await import("@composer/core");
    const before = snapshot(fx.workspaceRoot);

    const t0 = Date.now();
    let err: unknown;
    try {
      await compose(fx.projectRoot, "hero1", { primitive: "Hero", id: "hero1", title: "Hi" });
    } catch (e) {
      err = e;
    }
    const elapsed = Date.now() - t0;

    expect(err).toBeInstanceOf(ComposeTimeoutError);
    expect((err as { code?: string }).code).toBe("COMPOSE_TIMEOUT");
    // Fires within budget + a generous margin (no indefinite hang).
    expect(elapsed).toBeLessThan(LIMITS.maxComposeDurationMs + 3000);
    // Lock released before the error surfaced (FR-005/FR-008).
    expect(existsSync(join(fx.workspaceRoot, ".composer", "cache", "compose.lock"))).toBe(false);
    // Atomic: workspace tree byte-identical (nothing committed).
    expect(snapshot(fx.workspaceRoot)).toEqual(before);
  });
});

/** Snapshot workspace file paths (sorted), excluding the engine's `.composer/` cache. */
function snapshot(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (entry === ".composer") continue;
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push(abs.slice(root.length));
    }
  }
  walk(root);
  return out.sort();
}
