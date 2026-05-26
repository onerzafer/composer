// T089 — `composer compose <spec_id>` (FR-003, contracts/cli-commands.md).
//
// Human/CI alternative to the MCP `compose` tool. Reads the spec from
// `<workspace>/specs/<spec_id>.json` and routes through the same engine
// pipeline. Translates engine errors into the CLI exit-code table.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AuditFailedError,
  DriftDetectedError,
  LockHeldExposedError,
  RenderFailedError,
  SemanticValidationError,
  StructuralValidationError,
  compose as engineCompose,
  resolveWorkspace,
  type ComposeResult,
} from "@composer/core";
import { validate as engineValidate } from "@composer/core";

export class ComposeCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "ComposeCliError";
  }
}

export interface ComposeCliOptions {
  projectRoot: string;
  specId: string;
  dryRun?: boolean;
}

export async function composeCommand(
  opts: ComposeCliOptions,
): Promise<ComposeResult | { ok: true; preview: unknown }> {
  const ws = resolveWorkspace(opts.projectRoot);
  const specPath = join(ws.workspaceRoot, "specs", `${opts.specId}.json`);
  if (!existsSync(specPath)) {
    throw new ComposeCliError(`Spec not found: ${specPath}`, 1);
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(specPath, "utf8"));
  } catch (err) {
    throw new ComposeCliError(
      `Spec at ${specPath} is not valid JSON: ${(err as Error).message}`,
      1,
    );
  }

  try {
    if (opts.dryRun) {
      const preview = await engineValidate(opts.projectRoot, opts.specId, json);
      return { ok: true, preview };
    }
    return await engineCompose(opts.projectRoot, opts.specId, json, { surface: "cli" });
  } catch (err) {
    throw translateComposeError(err);
  }
}

function translateComposeError(err: unknown): ComposeCliError {
  if (err instanceof StructuralValidationError) {
    return new ComposeCliError(`Structural validation failed: ${err.message}`, 1);
  }
  if (err instanceof SemanticValidationError) {
    return new ComposeCliError(`Semantic validation failed: ${err.message}`, 2);
  }
  if (err instanceof AuditFailedError) {
    return new ComposeCliError(`Audit failed: ${err.message}`, 3);
  }
  if (err instanceof DriftDetectedError) {
    return new ComposeCliError(err.message, 4);
  }
  if (err instanceof RenderFailedError) {
    return new ComposeCliError(`Render failed: ${err.message}`, 5);
  }
  if (err instanceof LockHeldExposedError) {
    return new ComposeCliError(err.message, 7);
  }
  const m = err instanceof Error ? err.message : String(err);
  if (/path traversal/i.test(m)) return new ComposeCliError(m, 8);
  return new ComposeCliError(m, 6);
}
