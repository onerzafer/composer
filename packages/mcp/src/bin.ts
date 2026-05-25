#!/usr/bin/env node
// T051 — Composer MCP server binary.
//
// Spawns `createServer({ cwd })` against the current working directory and
// wires the stdio transport. The host agent (Claude Code, Codex, Gemini CLI,
// etc.) attaches via stdio MCP.

import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer({ cwd: process.cwd() });
  await server.start();
}

main().catch((err) => {
  process.stderr.write(
    `composer-mcp fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
