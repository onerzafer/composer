// T017 — Whole-workspace lockfile with stale-PID detection (FR-CONC-001..004).

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

export class WorkspaceLock {
  private acquired = false;

  constructor(private readonly lockPath: string) {}

  /**
   * Acquire the lock. Throws LockHeldError if another live process holds it.
   * Reclaims the lock if the recorded PID is dead (stale lock).
   */
  acquire(input: Omit<LockData, "started_at"> & { started_at?: string }): LockData {
    const data: LockData = {
      ...input,
      started_at: input.started_at ?? new Date().toISOString(),
    };
    if (existsSync(this.lockPath)) {
      const existing = this.tryRead();
      if (existing && this.isProcessAlive(existing.pid)) {
        throw new LockHeldError(existing);
      }
      // Stale or unparseable — reclaim.
    }
    this.write(data);
    this.acquired = true;
    return data;
  }

  release(): void {
    if (!this.acquired) return;
    try {
      if (existsSync(this.lockPath)) unlinkSync(this.lockPath);
    } catch {
      /* best-effort */
    }
    this.acquired = false;
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

  private write(data: LockData): void {
    mkdirSync(dirname(this.lockPath), { recursive: true });
    writeFileSync(this.lockPath, JSON.stringify(data, null, 2), "utf8");
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
 * Convenience: run `fn` while holding the workspace lock. Always releases on exit.
 */
export async function withWorkspaceLock<T>(
  workspaceRoot: string,
  input: Omit<LockData, "started_at">,
  fn: () => Promise<T>,
): Promise<T> {
  const lockPath = join(workspaceRoot, ".composer", "cache", "compose.lock");
  const lock = new WorkspaceLock(lockPath);
  lock.acquire(input);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}
