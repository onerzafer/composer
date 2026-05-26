#!/usr/bin/env node
// T070 — `composer` bin entrypoint.
//
// Commander wires subcommands → library functions; the lib functions throw
// `InitError` (etc.) carrying an exit code. The bin wrapper is the only place
// that calls process.exit() so the library remains testable.

import { Command } from "commander";
import { CLI_VERSION, init, InitError } from "./index.js";

const program = new Command();
program
  .name("composer")
  .description("Composer toolkit CLI")
  .version(CLI_VERSION);

program
  .command("init")
  .description("Initialize a new Composer-instrumented project")
  .option("--extends <pkg>", "Adopt a published adapter (npm package, optional @semver-major)")
  .option("--bare", "Minimal self-contained workspace; no adapter")
  .option("--workspace <path>", "Workspace folder name (default: ./design)")
  .option("--json", "Machine-readable output")
  .action(async (opts: { extends?: string; bare?: boolean; workspace?: string; json?: boolean }) => {
    try {
      const result = await init({
        projectRoot: process.cwd(),
        extends: opts.extends,
        bare: opts.bare,
        workspace: opts.workspace,
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(
          `Composer initialized in ${result.elapsedMs}ms\n` +
            `  composer.json: ${result.composerJson}\n` +
            (result.sampleSpec ? `  sample spec:   ${result.sampleSpec}\n` : "") +
            (result.sampleOutput ? `  sample output: ${result.sampleOutput}\n` : ""),
        );
      }
    } catch (err) {
      handleError(err, opts.json);
    }
  });

// Reserved-namespace stubs (FR-022 / T091). Documented in --help so the CLI
// namespace is stable for v1.x.
for (const reserved of ["ingest", "promote", "migrate"] as const) {
  program
    .command(`${reserved} [args...]`)
    .description(`(reserved for v1.x — not implemented in v0.1)`)
    .action(() => {
      process.stderr.write(
        `composer ${reserved}: not implemented in v0.1 — reserved for v1.x.\n`,
      );
      process.exit(99);
    });
}

program.parseAsync(process.argv).catch((err: unknown) => handleError(err, false));

function handleError(err: unknown, asJson: boolean | undefined): never {
  if (err instanceof InitError) {
    if (asJson) {
      process.stderr.write(
        JSON.stringify({ ok: false, exitCode: err.exitCode, message: err.message }) + "\n",
      );
    } else {
      process.stderr.write(`composer: ${err.message}\n`);
    }
    process.exit(err.exitCode);
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`composer: unexpected error — ${message}\n`);
  process.exit(1);
}
