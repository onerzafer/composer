// T090 — `composer validate <spec_id>` (FR-004, contracts/cli-commands.md).
//
// Dry-run preview — mirrors the MCP validate tool. Engine writes a validate
// log per FR-OBS-003 but no spec / no source files.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validate as engineValidate,
  resolveWorkspace,
  type ValidateResult,
} from "@composer/core";

export class ValidateCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "ValidateCliError";
  }
}

export interface ValidateCliOptions {
  projectRoot: string;
  specId: string;
}

export async function validateCommand(
  opts: ValidateCliOptions,
): Promise<ValidateResult> {
  const ws = resolveWorkspace(opts.projectRoot);
  const specPath = join(ws.workspaceRoot, "specs", `${opts.specId}.json`);
  if (!existsSync(specPath)) {
    throw new ValidateCliError(`Spec not found: ${specPath}`, 1);
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(specPath, "utf8"));
  } catch (err) {
    throw new ValidateCliError(
      `Spec at ${specPath} is not valid JSON: ${(err as Error).message}`,
      1,
    );
  }
  const result = await engineValidate(opts.projectRoot, opts.specId, json);
  if (!result.ok) {
    // ValidateError doesn't carry a phase tag in v0.1 — bin wrapper exits 1
    // for any validation failure; the `--json` output retains the full
    // structured error list per cli-commands.md.
    const summary = result.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new ValidateCliError(`Validation failed: ${summary}`, 1);
  }
  return result;
}
