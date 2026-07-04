// `composer discover` — CLI mirror of the MCP `composer.discover` tool
// (packages/mcp/src/tools/discover.ts, contracts/cli-commands.md).
//
// Lists the project's primitives (names + intents only), existing specs
// (ids + summaries), composition guidelines, and design tokens. Human/CI
// alternative to the MCP tool — same @composer/core entrypoint, so the JSON
// shape is identical.

import { discover as engineDiscover, type DiscoverResult } from "@composer/core";

export class DiscoverCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "DiscoverCliError";
  }
}

export interface DiscoverCliOptions {
  projectRoot: string;
}

export async function discoverCommand(
  opts: DiscoverCliOptions,
): Promise<DiscoverResult> {
  try {
    return await engineDiscover(opts.projectRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DiscoverCliError(message, 1);
  }
}
