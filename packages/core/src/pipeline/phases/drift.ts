// T037 — Pipeline phase: drift detection (FR-015).
//
// Before any overwrite, hash the existing file and compare against the
// previously-recorded hash. Mismatch ⇒ abort with diff + remediation options.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hashFile } from "../../drift/hasher.js";
import type { RenderedFile } from "./render.js";

export interface DriftIssue {
  path: string;
  diff: string;
  expectedHash: string;
  actualHash: string;
}

export class DriftDetectedError extends Error {
  readonly code = "DRIFT_DETECTED" as const;
  constructor(public readonly issues: DriftIssue[]) {
    super(
      `DRIFT_DETECTED: ${issues.map((i) => i.path).join(", ")} has been hand-edited. ` +
        `Options: (a) git checkout <file> && composer compose <spec>, or (b) lift the change ` +
        `into the spec/template and re-run.`,
    );
    this.name = "DriftDetectedError";
  }
}

export interface DriftCheckInput {
  projectRoot: string;
  rendered: RenderedFile[];
  previousHashes: Record<string, string>;
}

/**
 * For each file the upcoming compose would write:
 *   - if the file doesn't exist on disk: not drift (first-time creation)
 *   - if the file exists AND a previous hash is recorded for it AND the actual
 *     on-disk hash differs from the recorded hash: drift (abort)
 *   - if the file exists AND no previous hash is recorded: not drift (engine
 *     has never written this path; we assume the existing file is hand-authored
 *     and will be overwritten only if the adapter declares policy: 'overwrite')
 */
export function driftCheck(input: DriftCheckInput): void {
  const issues: DriftIssue[] = [];
  for (const file of input.rendered) {
    const absPath = join(input.projectRoot, file.path);
    if (!existsSync(absPath)) continue;
    const recordedHash = input.previousHashes[file.path];
    if (!recordedHash) continue;
    const actualHash = hashFile(absPath);
    if (actualHash !== recordedHash) {
      const onDisk = readFileSync(absPath, "utf8");
      issues.push({
        path: file.path,
        diff: buildShortDiff(onDisk, file.content),
        expectedHash: recordedHash,
        actualHash: actualHash ?? "<missing>",
      });
    }
  }
  if (issues.length > 0) throw new DriftDetectedError(issues);
}

function buildShortDiff(actual: string, expected: string): string {
  const aLines = actual.split("\n");
  const eLines = expected.split("\n");
  const out: string[] = [];
  const max = Math.max(aLines.length, eLines.length);
  for (let i = 0; i < max && out.length < 20; i++) {
    const a = aLines[i] ?? "<EOF>";
    const e = eLines[i] ?? "<EOF>";
    if (a !== e) {
      out.push(`- ${a}`);
      out.push(`+ ${e}`);
    }
  }
  return out.join("\n");
}
