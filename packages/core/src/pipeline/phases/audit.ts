// T035 — Pipeline phase: audit (cross-spec / project-wide rules).
//
// v0.1 minimum: orchestration shell. Adapter audit + project audit are run
// in sequence (parent first); each may throw AuditFailedError to abort.

import type { AuditRule, AuditResult } from "@composer/adapter-kit";

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

/** Run audit rules sequentially. */
export async function runAudit(rules: AuditRule[], state: AuditWorkspaceState): Promise<void> {
  for (const rule of rules) {
    const result = await Promise.resolve(rule(state));
    if (!result.ok) throw new AuditFailedError(result);
  }
}
