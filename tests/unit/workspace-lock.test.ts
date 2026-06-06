// 005 T008 — WorkspaceLock acquire/release unit tests (contracts/workspace-lock.md A1–A8, R1–R4).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceLock, LockHeldError, type LockData } from "@composer/core";

let dir: string;
let lockPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ws-lock-"));
  lockPath = join(dir, ".composer", "cache", "compose.lock");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// A PID extremely unlikely to be alive (above typical pid_max) → process.kill throws ESRCH.
const DEAD_PID = 2147483646;

function writeLock(data: Partial<LockData>): void {
  mkdirSync(join(dir, ".composer", "cache"), { recursive: true });
  const full: LockData = {
    pid: data.pid ?? process.pid,
    started_at: data.started_at ?? new Date().toISOString(),
    surface: data.surface ?? "cli",
    spec_id: data.spec_id ?? "x",
  };
  writeFileSync(lockPath, JSON.stringify(full, null, 2));
}

describe("WorkspaceLock.acquire — reclaim semantics (005)", () => {
  it("A1: creates a lock when none exists", () => {
    const lock = new WorkspaceLock(lockPath);
    const data = lock.acquire({ pid: process.pid, surface: "cli", spec_id: "s" });
    expect(existsSync(lockPath)).toBe(true);
    expect(data.pid).toBe(process.pid);
  });

  it("A2: reclaims a dead-PID lock", () => {
    writeLock({ pid: DEAD_PID });
    const lock = new WorkspaceLock(lockPath);
    expect(() => lock.acquire({ pid: process.pid, surface: "cli", spec_id: "s" })).not.toThrow();
  });

  it("A3: reclaims an unparseable lock", () => {
    mkdirSync(join(dir, ".composer", "cache"), { recursive: true });
    writeFileSync(lockPath, "{ not json");
    const lock = new WorkspaceLock(lockPath);
    expect(() => lock.acquire({ pid: process.pid, surface: "cli", spec_id: "s" })).not.toThrow();
  });

  it("A4: throws LockHeldError for a live PID within TTL", () => {
    writeLock({ pid: process.pid, started_at: new Date().toISOString() });
    const lock = new WorkspaceLock(lockPath, { maxHoldMs: 60_000 });
    expect(() => lock.acquire({ pid: process.pid, surface: "cli", spec_id: "s" })).toThrow(
      LockHeldError,
    );
  });

  it("A5: reclaims a live-PID lock older than the TTL", () => {
    writeLock({ pid: process.pid, started_at: new Date(Date.now() - 600_000).toISOString() });
    const lock = new WorkspaceLock(lockPath, { maxHoldMs: 1_000 });
    expect(() => lock.acquire({ pid: process.pid, surface: "cli", spec_id: "s" })).not.toThrow();
  });

  it("A8: clock skew — a just-now/future started_at is never stale (clamped to fresh)", () => {
    writeLock({ pid: process.pid, started_at: new Date(Date.now() + 5_000).toISOString() });
    const lock = new WorkspaceLock(lockPath, { maxHoldMs: 1_000 });
    expect(() => lock.acquire({ pid: process.pid, surface: "cli", spec_id: "s" })).toThrow(
      LockHeldError,
    );
  });

  it("A7: reclaim race — second acquirer sees LockHeldError against the NEW lock", () => {
    writeLock({ pid: DEAD_PID, started_at: new Date(0).toISOString() }); // reclaimable
    const a = new WorkspaceLock(lockPath, { maxHoldMs: 1_000 });
    const b = new WorkspaceLock(lockPath, { maxHoldMs: 1_000 });
    const aData = a.acquire({ pid: process.pid, surface: "cli", spec_id: "a" });
    // b now sees a's fresh, within-TTL lock and must fail against it (not the reclaimed one).
    let thrown: unknown;
    try {
      b.acquire({ pid: process.pid, surface: "cli", spec_id: "b" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(LockHeldError);
    expect((thrown as LockHeldError).lock.spec_id).toBe("a");
    expect((thrown as LockHeldError).lock.started_at).toBe(aData.started_at);
  });
});

describe("WorkspaceLock.release — ownership (005 FR-006)", () => {
  it("R1: releases a lock it owns", () => {
    const lock = new WorkspaceLock(lockPath);
    lock.acquire({ pid: process.pid, surface: "cli", spec_id: "s" });
    lock.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("R2: no-op when the lock was reclaimed by another holder", () => {
    const a = new WorkspaceLock(lockPath, { maxHoldMs: 1_000 });
    a.acquire({ pid: process.pid, surface: "cli", spec_id: "a" });
    // Simulate a reclaim by a new holder: same pid, different started_at + spec.
    const newHolder: LockData = {
      pid: process.pid,
      started_at: new Date(Date.now() + 1_000).toISOString(),
      surface: "cli",
      spec_id: "b",
    };
    writeFileSync(lockPath, JSON.stringify(newHolder, null, 2));
    a.release(); // must NOT delete b's lock
    expect(existsSync(lockPath)).toBe(true);
    expect(JSON.parse(readFileSync(lockPath, "utf8")).spec_id).toBe("b");
  });

  it("R3: no-op when the lock file is already gone", () => {
    const lock = new WorkspaceLock(lockPath);
    lock.acquire({ pid: process.pid, surface: "cli", spec_id: "s" });
    rmSync(lockPath, { force: true });
    expect(() => lock.release()).not.toThrow();
  });

  it("R4: no-op when never acquired", () => {
    const lock = new WorkspaceLock(lockPath);
    expect(() => lock.release()).not.toThrow();
  });
});
