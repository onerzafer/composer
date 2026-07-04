// T035 — Pipeline phase: audit (cross-spec / project-wide rules).
//
// v0.1 minimum: orchestration shell. Adapter audit + project audit are run
// in sequence (parent first); each may throw AuditFailedError to abort.
//
// Warnings are collected (not discarded) across every rule that reports
// ok:true, and returned to the caller so compose()/validate() can surface
// them end-to-end (contracts §compose/validate). When `strict` is set
// (compose's `--strict`), any warnings collected across the whole chain are
// escalated into an AuditFailedError once the chain finishes running.

import type { AuditRule, AuditResult, AuditWarning } from "@composer/adapter-kit";

export class AuditFailedError extends Error {
  readonly code = "AUDIT_FAILED" as const;
  constructor(public readonly result: AuditResult) {
    super(
      "AUDIT_FAILED: " +
        result.errors.map((e) => `${e.path ?? "/"} ${e.message}`).join("; "),
    );
    this.name = "AuditFailedError";
  }
}

export interface AuditWorkspaceState {
  catalog: unknown;
  specs: { id: string; json: unknown }[];
  tokens: Record<string, unknown>;
}

export interface RunAuditOptions {
  /** Escalate any warning collected across the audit chain into an
   * AuditFailedError once every rule has run (compose `--strict`). */
  strict?: boolean;
}

/** Run audit rules sequentially. Throws AuditFailedError on the first rule
 * that reports errors (ok:false). Returns every warning collected from rules
 * that passed (ok:true) — the caller decides what to do with them. */
export async function runAudit(
  rules: AuditRule[],
  state: AuditWorkspaceState,
  options: RunAuditOptions = {},
): Promise<AuditWarning[]> {
  const warnings: AuditWarning[] = [];
  for (const rule of rules) {
    const result = await Promise.resolve(rule(state));
    if (!result.ok) throw new AuditFailedError(result);
    warnings.push(...result.warnings);
  }
  if (options.strict && warnings.length > 0) {
    throw new AuditFailedError({
      ok: false,
      errors: warnings.map((w) => ({
        path: w.path,
        message: w.message,
        suggestion: "escalated from a warning by --strict",
      })),
      warnings: [],
    });
  }
  return warnings;
}
