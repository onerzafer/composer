// T083 — Drift abort message formatter.
//
// The DriftDetectedError (drift.ts phase) carries a per-file diff and
// remediation hint inline. This module exposes formatters for the CLI/MCP
// callers that want a presentation tailored to their surface (human stderr
// vs structured JSON for agents/CI).

import type { DriftIssue } from "../pipeline/phases/drift.js";

export interface DriftAbortReport {
  code: "DRIFT_DETECTED";
  issues: DriftIssue[];
  remediation: {
    git_revert: string;
    lift_into_spec: string;
  };
}

export function buildDriftAbortReport(issues: DriftIssue[]): DriftAbortReport {
  const paths = issues.map((i) => i.path).join(" ");
  return {
    code: "DRIFT_DETECTED",
    issues,
    remediation: {
      git_revert: `git checkout -- ${paths} && composer compose <spec>`,
      lift_into_spec: `Edit the spec/template so its regenerated output already matches your hand-edit, then re-run \`composer compose <spec>\`.`,
    },
  };
}

/** Human-friendly multi-line block suitable for stderr. */
export function formatDriftAbortHuman(report: DriftAbortReport): string {
  const lines: string[] = [
    `composer: DRIFT_DETECTED — ${report.issues.length} file(s) hand-edited since last compose.`,
  ];
  for (const issue of report.issues) {
    lines.push("");
    lines.push(`  ${issue.path}`);
    lines.push(`    expected hash: ${issue.expectedHash}`);
    lines.push(`    actual hash:   ${issue.actualHash}`);
    if (issue.diff) {
      lines.push(`    diff (truncated):`);
      for (const dl of issue.diff.split("\n")) lines.push(`      ${dl}`);
    }
  }
  lines.push("");
  lines.push("Remediation:");
  lines.push(`  (a) Revert via git:  ${report.remediation.git_revert}`);
  lines.push(`  (b) Lift into spec:  ${report.remediation.lift_into_spec}`);
  return lines.join("\n") + "\n";
}
