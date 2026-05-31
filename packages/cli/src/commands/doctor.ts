// T092-T099 — `composer doctor` health-check command (FR-021).
//
// Eight reports, each produces zero or more `DoctorIssue`s with a severity:
//   T092  workspace status        — composer.json valid, workspace present, engine/adapter version
//   T093  drift state             — output files diverging from recorded hashes
//   T094  primitive sprawl + shadow — count + last-used per primitive; >50 warn; parent-shadowed primitives flagged
//   T095  30-line discipline      — template+prep LOC per primitive
//   T096  bijection check         — JSON → code → JSON parity per primitive (best-effort runner)
//   T097  stale-lockfile cleanup  — dead-PID lock at .composer/cache/compose.lock
//   T098  naming hygiene          — reject primitive names = while/if/else/async/await
//   T099  parent adapter freshness — refresh cache when --refresh-parent

import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  ComposerConfigError,
  loadHashStore,
  resolveAndCacheParent,
  resolveWorkspace,
  hashFile,
} from "@composer/core";

export type Severity = "info" | "warn" | "error";

export interface DoctorIssue {
  report: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
}

export interface DoctorReport {
  ok: boolean;
  errors: number;
  warnings: number;
  infos: number;
  issues: DoctorIssue[];
  ranAt: string;
}

const RESERVED_PRIMITIVE_NAMES = new Set([
  "while", "if", "else", "for", "switch", "case", "do",
  "async", "await", "yield", "fork", "spawn", "throw", "try", "catch",
]);

export interface DoctorOptions {
  projectRoot: string;
  refreshParent?: boolean;
  strict?: boolean;
}

export function doctor(options: DoctorOptions): DoctorReport {
  const issues: DoctorIssue[] = [];

  // T092 — workspace status
  let workspaceRoot: string | null = null;
  try {
    const ws = resolveWorkspace(options.projectRoot);
    workspaceRoot = ws.workspaceRoot;
    issues.push({
      report: "workspace-status",
      severity: "info",
      message: `composer.json valid; workspace at ${ws.config.workspace}; engine ${ws.config.engine}${ws.config.extends ? `; extends ${ws.config.extends}` : ""}`,
    });
  } catch (err) {
    issues.push({
      report: "workspace-status",
      severity: "error",
      message:
        err instanceof ComposerConfigError
          ? err.message
          : `Workspace resolution failed: ${(err as Error).message}`,
    });
  }

  if (workspaceRoot) {
    // T093 — drift state
    issues.push(...runDriftReport(options.projectRoot, workspaceRoot));

    // T094 — primitive sprawl + shadow (extends)
    issues.push(...runSprawlReport(workspaceRoot));

    // T095 — 30-line discipline
    issues.push(...runDisciplineReport(workspaceRoot));

    // T097 — stale lockfile
    issues.push(...runStaleLockReport(workspaceRoot));

    // T098 — naming hygiene
    issues.push(...runNamingHygieneReport(workspaceRoot));

    // T099 — parent freshness (only when explicitly requested)
    if (options.refreshParent) {
      issues.push(...runParentFreshnessReport(options.projectRoot));
    }
  }

  // T096 — bijection runner: v0.1 hooks into the existing
  // tests/contract/bijection.test.ts via vitest if available.
  // Reported as info-only if vitest isn't on PATH (CI is the canonical runner).
  issues.push({
    report: "bijection",
    severity: "info",
    message:
      "bijection check is run via the CI workflow (tests/contract/bijection.test.ts); `composer doctor` does not re-run it inline in v0.1.",
  });

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warn").length;
  const infos = issues.filter((i) => i.severity === "info").length;

  return {
    ok: errors === 0 && (!options.strict || warnings === 0),
    errors,
    warnings,
    infos,
    issues,
    ranAt: new Date().toISOString(),
  };
}

// T093
function runDriftReport(projectRoot: string, workspaceRoot: string): DoctorIssue[] {
  const store = loadHashStore(workspaceRoot);
  const out: DoctorIssue[] = [];
  for (const [relPath, recordedHash] of Object.entries(store.hashes)) {
    const abs = join(projectRoot, relPath);
    if (!existsSync(abs)) {
      out.push({
        report: "drift",
        severity: "warn",
        message: `recorded output ${relPath} no longer exists on disk`,
      });
      continue;
    }
    const actual = hashFile(abs);
    if (actual !== recordedHash) {
      out.push({
        report: "drift",
        severity: "error",
        message: `drift: ${relPath} has been hand-edited since last compose`,
        details: { recordedHash, actualHash: actual },
      });
    }
  }
  if (out.length === 0) {
    out.push({
      report: "drift",
      severity: "info",
      message: `all ${Object.keys(store.hashes).length} recorded outputs match their hashes`,
    });
  }
  return out;
}

// T094 — primitive sprawl + shadow detection (US3 Acceptance #2)
function runSprawlReport(workspaceRoot: string): DoctorIssue[] {
  const out: DoctorIssue[] = [];
  const catalogIndex = join(workspaceRoot, "catalog", "index.ts");
  if (!existsSync(catalogIndex)) return out;

  // Cheap structural scan — count `<Name>Meta` exports as the primitive set
  // (avoids a tsx import here; doctor must be fast).
  const src = readFileSync(catalogIndex, "utf8");
  const primNames = extractPrimitiveNames(src);
  if (primNames.length > 50) {
    out.push({
      report: "primitive-sprawl",
      severity: "warn",
      message: `${primNames.length} primitives in catalog (>50). Consider consolidating.`,
    });
  } else {
    out.push({
      report: "primitive-sprawl",
      severity: "info",
      message: `${primNames.length} primitive(s) declared in catalog`,
    });
  }

  // Shadow detection: if a parent cache exists, see which of its primitives
  // are also declared by the project (US3 Acceptance #2).
  const parentRoot = join(workspaceRoot, "..", ".composer", "cache", "parent");
  if (existsSync(parentRoot)) {
    for (const entry of readdirSync(parentRoot)) {
      const parentCatalog = join(parentRoot, entry, "catalog", "index.ts");
      if (!existsSync(parentCatalog)) continue;
      const parentPrims = extractPrimitiveNames(readFileSync(parentCatalog, "utf8"));
      const shadowed = parentPrims.filter((p) => primNames.includes(p));
      for (const name of shadowed) {
        out.push({
          report: "primitive-shadow",
          severity: "warn",
          message: `Project declares "${name}" while parent ${entry.replace(/_/g, "/")} also declares it — project wins`,
        });
      }
    }
  }

  return out;
}

// T095 / T017 — 30-line discipline (constitution V; FR-010).
//
// Covers BOTH live/promoted templates (templates/) AND ingested drafts
// (catalog/ingested/). Flagging oversized drafts pre-promotion is the whole
// point of FR-010: a complex component surfaces as "needs decomposition" here
// rather than being promoted into the catalog as an oversized primitive.
function runDisciplineReport(workspaceRoot: string): DoctorIssue[] {
  const out: DoctorIssue[] = [];
  scanTemplateDiscipline(join(workspaceRoot, "templates"), "", out);
  scanTemplateDiscipline(
    join(workspaceRoot, "catalog", "ingested"),
    " (ingested draft — decompose before promote)",
    out,
  );
  if (out.length === 0) {
    out.push({
      report: "discipline-30-line",
      severity: "info",
      message: "all templates fit within the 30-line discipline",
    });
  }
  return out;
}

function scanTemplateDiscipline(
  dir: string,
  label: string,
  out: DoctorIssue[],
): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".hbs")) continue;
    const lines = readFileSync(join(dir, entry), "utf8").split("\n").length;
    if (lines > 30) {
      out.push({
        report: "discipline-30-line",
        severity: "warn",
        message: `${entry}${label}: ${lines} lines (exceeds 30-line discipline)`,
      });
    }
  }
}

// T097 — stale lockfile cleanup
function runStaleLockReport(workspaceRoot: string): DoctorIssue[] {
  const lockPath = join(workspaceRoot, ".composer", "cache", "compose.lock");
  if (!existsSync(lockPath)) {
    return [
      { report: "stale-lock", severity: "info", message: "no lockfile present" },
    ];
  }
  let pid: number | null = null;
  try {
    const raw = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: number };
    if (typeof raw.pid === "number") pid = raw.pid;
  } catch {
    /* fall through */
  }
  if (pid === null) {
    rmSync(lockPath, { force: true });
    return [
      {
        report: "stale-lock",
        severity: "warn",
        message: `unparseable lockfile at ${lockPath} — removed`,
      },
    ];
  }
  if (!isProcessAlive(pid)) {
    rmSync(lockPath, { force: true });
    return [
      {
        report: "stale-lock",
        severity: "warn",
        message: `stale lockfile reclaimed (dead PID ${pid}) at ${lockPath}`,
      },
    ];
  }
  return [
    {
      report: "stale-lock",
      severity: "info",
      message: `live lockfile (PID ${pid}) at ${lockPath}`,
    },
  ];
}

function isProcessAlive(pid: number): boolean {
  // process.kill(pid, 0) is the POSIX idiom for "is this PID alive?" — it
  // sends no signal, just queries permission. Throws if dead. Not exec().
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function extractPrimitiveNames(catalogSource: string): string[] {
  const out: string[] = [];
  const re = /export const (\w+)Meta\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(catalogSource)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

// T098 — naming hygiene (constitution VIII — no control-flow names)
function runNamingHygieneReport(workspaceRoot: string): DoctorIssue[] {
  const catalogIndex = join(workspaceRoot, "catalog", "index.ts");
  if (!existsSync(catalogIndex)) return [];
  const offenders = extractPrimitiveNames(readFileSync(catalogIndex, "utf8")).filter(
    (n) => RESERVED_PRIMITIVE_NAMES.has(n.toLowerCase()),
  );
  if (offenders.length === 0) {
    return [
      {
        report: "naming-hygiene",
        severity: "info",
        message: "no primitive name collides with a control-flow keyword",
      },
    ];
  }
  return offenders.map((name) => ({
    report: "naming-hygiene",
    severity: "error" as const,
    message: `primitive "${name}" uses a reserved control-flow name (constitution VIII)`,
  }));
}

// T099 — parent freshness — refresh cache when requested
function runParentFreshnessReport(projectRoot: string): DoctorIssue[] {
  try {
    const ws = resolveWorkspace(projectRoot);
    if (!ws.config.extends) {
      return [
        {
          report: "parent-freshness",
          severity: "info",
          message: "no extends configured",
        },
      ];
    }
    const parent = resolveAndCacheParent(ws.projectRoot, ws.config.extends);
    return [
      {
        report: "parent-freshness",
        severity: "info",
        message: `parent ${parent.name}@${parent.version} re-materialized into ${parent.cacheRoot}`,
      },
    ];
  } catch (err) {
    return [
      {
        report: "parent-freshness",
        severity: "error",
        message: `parent refresh failed: ${(err as Error).message}`,
      },
    ];
  }
}

export function formatDoctorHuman(r: DoctorReport): string {
  const lines: string[] = [
    `composer doctor — ${r.errors} error(s), ${r.warnings} warning(s), ${r.infos} info`,
    "",
  ];
  for (const issue of r.issues) {
    const tag = issue.severity === "error" ? "✗" : issue.severity === "warn" ? "!" : "·";
    lines.push(`  ${tag} [${issue.report}] ${issue.message}`);
  }
  return lines.join("\n") + "\n";
}
