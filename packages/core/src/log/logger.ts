// T019 — Structured JSON logger (FR-OBS-001/002/003, research R14).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PhaseName =
  | "resolve-workspace"
  | "compile-catalog"
  | "structural-validate"
  | "semantic-validate"
  | "audit"
  | "render-staging"
  | "drift-check"
  | "atomic-commit"
  | "post-write-audit";

export type Outcome = "ok" | "error" | "skipped";

export interface PhaseEntry {
  phase: PhaseName;
  duration_ms: number;
  outcome: Outcome;
  meta?: Record<string, unknown>;
}

export interface ErrorEntry {
  phase: PhaseName | null;
  path: string | null;
  message: string;
  suggestion?: string;
}

export interface FileWritten {
  path: string;
  kind: "created" | "updated";
  hash: string;
}

export interface InvocationInfo {
  timestamp: string;
  surface: "mcp" | "cli";
  engine_version: string;
  adapter_version: string | null;
  node_version: string;
  pid: number;
}

export interface SpecInfo {
  id: string;
  path: string | null;
  hash: string | null;
}

export interface LogEntry {
  version: 1;
  invocation: InvocationInfo;
  spec: SpecInfo;
  phases: PhaseEntry[];
  errors: ErrorEntry[];
  files_written: FileWritten[];
  status: "ok" | "error";
}

export class Logger {
  private readonly phases: PhaseEntry[] = [];
  private readonly errors: ErrorEntry[] = [];
  private readonly files: FileWritten[] = [];

  constructor(
    private readonly invocation: InvocationInfo,
    private readonly spec: SpecInfo,
    private readonly logPath: string,
  ) {}

  recordPhase(entry: PhaseEntry): void {
    this.phases.push(entry);
  }

  recordError(entry: ErrorEntry): void {
    this.errors.push(entry);
  }

  recordFile(entry: FileWritten): void {
    this.files.push(entry);
  }

  finalize(status: "ok" | "error"): LogEntry {
    const entry: LogEntry = {
      version: 1,
      invocation: this.invocation,
      spec: this.spec,
      phases: this.phases,
      errors: this.errors,
      files_written: this.files,
      status,
    };
    mkdirSync(dirname(this.logPath), { recursive: true });
    writeFileSync(this.logPath, JSON.stringify(entry, null, 2), "utf8");
    return entry;
  }

  /** One-line stderr summary per FR-OBS-002. */
  summary(status: "ok" | "error"): string {
    if (status === "ok") {
      return `compose ok — ${this.files.length} file(s) written · log: ${this.logPath}`;
    }
    const first = this.errors[0];
    const phase = first?.phase ?? "unknown";
    const msg = first?.message ?? "unknown error";
    return `compose failed at phase=${phase}: ${msg} · log: ${this.logPath}`;
  }

  get logFilePath(): string {
    return this.logPath;
  }
}

/**
 * Compute the log path for a compose or validate invocation.
 * Compose: `<workspaceRoot>/.composer/logs/<ISO-ts>-<specId>.json`
 * Validate: `<workspaceRoot>/.composer/logs/<ISO-ts>-<specId>-validate.json`
 */
export function buildLogPath(
  workspaceRoot: string,
  specId: string,
  kind: "compose" | "validate",
): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = kind === "validate" ? "-validate" : "";
  return join(workspaceRoot, ".composer", "logs", `${ts}-${specId}${suffix}.json`);
}
