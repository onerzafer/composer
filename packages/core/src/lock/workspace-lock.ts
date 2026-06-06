// T017 (001) + 005 — Whole-workspace lockfile with age-based + dead-PID reclaim.
//
// Lifecycle fixes (005):
//   • acquire(): atomic O_EXCL create + bounded reclaim-retry. Reclaims an existing
//     lock when it is unparseable, its PID is dead, OR its started_at age exceeds the
//     max-hold TTL (even if the PID is alive). A genuinely in-progress compose (live
//     PID, within TTL) still fails fast with LockHeldError.
//   • release(): ownership-checked — only unlinks a lock whose (pid, started_at) still
//     matches what this instance wrote, so a reclaimed-then-resumed holder cannot delete
//     the new holder's lock.

import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_LIMITS } from "../config/limits.js";

export interface LockData {
  pid: number;
  started_at: string; // ISO 8601
  surface: "mcp" | "cli";
  spec_id: string;
}

export class LockHeldError extends Error {
  constructor(public readonly lock: LockData) {
    super(
      `compose in progress (pid ${lock.pid}, started ${lock.started_at}, surface ${lock.surface}, spec ${lock.spec_id})`,
    );
    this.name = "LockHeldError";
  }
}

export interface WorkspaceLockOptions {
  /** Lock TTL (ms). A lock older than this is reclaimable even if its PID is alive. */
  maxHoldMs?: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}

const MAX_RECLAIM_ATTEMPTS = 5;

export class WorkspaceLock {
  private owned: { pid: number; started_at: string } | null = null;
  private readonly maxHoldMs: number;
  private readonly now: () => number;

  constructor(
    private readonly lockPath: string,
    opts: WorkspaceLockOptions = {},
  ) {
    this.maxHoldMs = opts.maxHoldMs ?? DEFAULT_LIMITS.maxHoldMs;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Acquire the lock atomically (O_EXCL). Throws LockHeldError if a live, within-TTL
   * holder exists. Reclaims unparseable / dead-PID / age-stale locks. Under a reclaim
   * race exactly one caller wins; the others see LockHeldError against the new lock.
   */
  acquire(input: Omit<LockData, "started_at"> & { started_at?: string }): LockData {
    const data: LockData = {
      ...input,
      started_at: input.started_at ?? new Date(this.now()).toISOString(),
    };
    const serialized = JSON.stringify(data, null, 2);

    for (let attempt = 0; attempt < MAX_RECLAIM_ATTEMPTS; attempt++) {
      mkdirSync(dirname(this.lockPath), { recursive: true });
      let fd: number;
      try {
        fd = openSync(this.lockPath, "wx"); // O_CREAT | O_EXCL | O_WRONLY
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        const existing = this.tryRead();
        if (existing && !this.isReclaimable(existing)) {
          throw new LockHeldError(existing);
        }
        // Reclaimable (unparseable | dead PID | age > TTL) — steal and retry the create.
        try {
          unlinkSync(this.lockPath);
        } catch {
          /* raced with another reclaimer; the retry loop re-evaluates */
        }
        continue;
      }
      try {
        writeFileSync(fd, serialized, "utf8");
      } finally {
        closeSync(fd);
      }
      this.owned = { pid: data.pid, started_at: data.started_at };
      return data;
    }

    // Exhausted attempts: another caller keeps winning the create — treat as held.
    const existing = this.tryRead();
    throw new LockHeldError(existing ?? data);
  }

  /** Release the lock, but only if we still own it (FR-006). */
  release(): void {
    const owned = this.owned;
    this.owned = null;
    if (!owned) return;
    try {
      const current = this.tryRead();
      if (current && current.pid === owned.pid && current.started_at === owned.started_at) {
        unlinkSync(this.lockPath);
      }
      // else: reclaimed by another holder, or already gone — no-op.
    } catch {
      /* best-effort */
    }
  }

  /** Reclaimable if dead-PID, malformed timestamp, or age-stale. (Unparseable handled by caller.) */
  private isReclaimable(existing: LockData): boolean {
    if (!this.isProcessAlive(existing.pid)) return true;
    const startedMs = Date.parse(existing.started_at);
    if (Number.isNaN(startedMs)) return true; // malformed timestamp — don't trust it
    const age = Math.max(0, this.now() - startedMs); // clamp clock skew (R7)
    return age > this.maxHoldMs;
  }

  private tryRead(): LockData | null {
    try {
      const raw = readFileSync(this.lockPath, "utf8");
      const parsed = JSON.parse(raw) as LockData;
      if (
        typeof parsed.pid === "number" &&
        typeof parsed.started_at === "string" &&
        (parsed.surface === "mcp" || parsed.surface === "cli")
      ) {
        return parsed;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private isProcessAlive(pid: number): boolean {
    if (pid <= 0 || pid === process.pid) return pid === process.pid;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      // EPERM = exists but we lack permission; treat as alive.
      return code === "EPERM";
    }
  }
}

/**
 * Convenience: run `fn` while holding the workspace lock. Always releases
 * (ownership-checked) on exit.
 */
export async function withWorkspaceLock<T>(
  workspaceRoot: string,
  input: Omit<LockData, "started_at">,
  fn: () => Promise<T>,
  opts: WorkspaceLockOptions = {},
): Promise<T> {
  const lockPath = join(workspaceRoot, ".composer", "cache", "compose.lock");
  const lock = new WorkspaceLock(lockPath, opts);
  lock.acquire(input);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}
