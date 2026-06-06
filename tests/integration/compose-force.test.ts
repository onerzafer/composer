// 005 T023 — `composer compose --force` force-breaks a lock (US3 / FR-010, contract C1/C2).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeFixture,
  STUB_CATALOG_INDEX,
  STUB_HERO_TEMPLATE,
  STUB_OUTPUT_MAP,
  type Fixture,
} from "../helpers/fixture.js";
import { composeCommand, ComposeCliError } from "@composer/cli";

const HERO_SPEC = JSON.stringify({ primitive: "Hero", id: "hero1", title: "Hi" }, null, 2);

function writeFreshLock(workspaceRoot: string): void {
  const cache = join(workspaceRoot, ".composer", "cache");
  mkdirSync(cache, { recursive: true });
  writeFileSync(
    join(cache, "compose.lock"),
    JSON.stringify(
      { pid: process.pid, started_at: new Date().toISOString(), surface: "cli", spec_id: "other" },
      null,
      2,
    ),
  );
}

describe("compose --force (005 US3)", () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = makeFixture({
      files: {
        "catalog/index.ts": STUB_CATALOG_INDEX,
        "templates/hero.ts.hbs": STUB_HERO_TEMPLATE,
        "output.map.ts": STUB_OUTPUT_MAP,
        "specs/hero1.json": HERO_SPEC,
      },
    });
  });
  afterEach(() => fx.cleanup());

  it("C1: a fresh held lock blocks compose, but --force breaks it and composes", async () => {
    writeFreshLock(fx.workspaceRoot);
    // Without --force, the fresh (within-TTL) lock → LOCK_HELD (exit code 7).
    await expect(
      composeCommand({ projectRoot: fx.projectRoot, specId: "hero1" }),
    ).rejects.toBeInstanceOf(ComposeCliError);

    // With --force, the lock is broken and the compose succeeds.
    writeFreshLock(fx.workspaceRoot);
    const result = await composeCommand({
      projectRoot: fx.projectRoot,
      specId: "hero1",
      force: true,
    });
    expect("files_written" in result).toBe(true);
    if ("files_written" in result) {
      expect(result.files_written.length).toBeGreaterThan(0);
    }
  });

  it("C2: --force with no lock present behaves as a normal compose", async () => {
    const result = await composeCommand({
      projectRoot: fx.projectRoot,
      specId: "hero1",
      force: true,
    });
    expect("files_written" in result).toBe(true);
  });
});
