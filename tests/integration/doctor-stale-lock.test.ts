// 005 T022 — doctor age-aware stale-lock report + --fix (US3 / FR-009/010, contract D1–D5).

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
import { doctor, type DoctorReport } from "@composer/cli";

const DEAD_PID = 2147483646;

function writeLock(workspaceRoot: string, lock: Record<string, unknown> | string): void {
  const cache = join(workspaceRoot, ".composer", "cache");
  mkdirSync(cache, { recursive: true });
  writeFileSync(
    join(cache, "compose.lock"),
    typeof lock === "string" ? lock : JSON.stringify(lock, null, 2),
  );
}
const lockPath = (workspaceRoot: string) =>
  join(workspaceRoot, ".composer", "cache", "compose.lock");
const staleIssue = (report: DoctorReport) =>
  report.issues.find((i) => i.report === "stale-lock");

describe("doctor stale-lock report (005 US3)", () => {
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

  it("D4: age-stale live-PID lock → reclaimable warn with pid/age/surface/spec, not auto-removed (FR-009)", () => {
    writeLock(fx.workspaceRoot, {
      pid: process.pid,
      started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      surface: "mcp",
      spec_id: "weather",
    });
    const issue = staleIssue(doctor({ projectRoot: fx.projectRoot }));
    expect(issue?.severity).toBe("warn");
    expect(issue?.message).toMatch(/reclaimable/i);
    expect(issue?.message).toContain(String(process.pid));
    expect(issue?.message).toContain("weather");
    expect(issue?.message).toContain("mcp");
    expect(existsSync(lockPath(fx.workspaceRoot))).toBe(true); // not removed without --fix
  });

  it("D4 + --fix: removes the age-stale live-PID lock (FR-010)", () => {
    writeLock(fx.workspaceRoot, {
      pid: process.pid,
      started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      surface: "mcp",
      spec_id: "weather",
    });
    const issue = staleIssue(doctor({ projectRoot: fx.projectRoot, fix: true }));
    expect(issue?.severity).toBe("warn");
    expect(issue?.message).toMatch(/removed/i);
    expect(existsSync(lockPath(fx.workspaceRoot))).toBe(false);
  });

  it("D5: within-TTL live lock → info, untouched even with --fix (SC-004)", () => {
    writeLock(fx.workspaceRoot, {
      pid: process.pid,
      started_at: new Date().toISOString(),
      surface: "cli",
      spec_id: "fresh",
    });
    const issue = staleIssue(doctor({ projectRoot: fx.projectRoot, fix: true }));
    expect(issue?.severity).toBe("info");
    expect(existsSync(lockPath(fx.workspaceRoot))).toBe(true);
  });

  it("D3: dead-PID lock → reclaimed/removed (preserved)", () => {
    writeLock(fx.workspaceRoot, {
      pid: DEAD_PID,
      started_at: new Date().toISOString(),
      surface: "cli",
      spec_id: "dead",
    });
    const issue = staleIssue(doctor({ projectRoot: fx.projectRoot }));
    expect(issue?.severity).toBe("warn");
    expect(issue?.message).toMatch(/dead PID/i);
    expect(existsSync(lockPath(fx.workspaceRoot))).toBe(false);
  });

  it("D2: unparseable lock → removed (preserved)", () => {
    writeLock(fx.workspaceRoot, "{ not json");
    const issue = staleIssue(doctor({ projectRoot: fx.projectRoot }));
    expect(issue?.severity).toBe("warn");
    expect(issue?.message).toMatch(/unparseable/i);
    expect(existsSync(lockPath(fx.workspaceRoot))).toBe(false);
  });

  it("D1: no lock → info", () => {
    const issue = staleIssue(doctor({ projectRoot: fx.projectRoot }));
    expect(issue?.severity).toBe("info");
    expect(issue?.message).toMatch(/no lockfile/i);
  });
});
