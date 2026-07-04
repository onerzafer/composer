// `composer scaffold` — CLI mirror of the MCP `composer.scaffold` tool
// (packages/mcp/src/tools/scaffold.ts, contracts/cli-commands.md).
//
// Either (--primitive) return the full schema, examples, and field guidance
// for one primitive, plus a starter JSON skeleton; or (--spec) return the
// full JSON content of an existing spec for editing. Human/CI alternative to
// the MCP tool — same @composer/core entrypoint, so the JSON shape is
// identical.

import { scaffold as engineScaffold, type ScaffoldInput, type ScaffoldResult } from "@composer/core";

export class ScaffoldCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "ScaffoldCliError";
  }
}

export interface ScaffoldCliOptions {
  projectRoot: string;
  primitive?: string;
  intent?: string;
  specId?: string;
}

export async function scaffoldCommand(
  opts: ScaffoldCliOptions,
): Promise<ScaffoldResult> {
  const input = normalizeScaffoldInput(opts);
  try {
    return await engineScaffold(opts.projectRoot, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ScaffoldCliError(message, 1);
  }
}

function normalizeScaffoldInput(opts: ScaffoldCliOptions): ScaffoldInput {
  if (opts.primitive) {
    const input: ScaffoldInput = { kind: "primitive", primitive: opts.primitive };
    if (opts.intent) input.intent = opts.intent;
    return input;
  }
  if (opts.specId) {
    return { kind: "spec", spec_id: opts.specId };
  }
  throw new ScaffoldCliError(
    "scaffold requires either --primitive <name> or --spec <spec_id>",
    1,
  );
}
