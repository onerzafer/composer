#!/usr/bin/env node
// T070 — `composer` bin entrypoint.
//
// Commander wires subcommands → library functions; the lib functions throw
// `InitError` (etc.) carrying an exit code. The bin wrapper is the only place
// that calls process.exit() so the library remains testable.

import { Command } from "commander";
import {
  CLI_VERSION,
  init,
  InitError,
  explain,
  ExplainError,
  formatExplainHuman,
  trace,
  TraceError,
  formatTraceHuman,
  composeCommand,
  ComposeCliError,
  validateCommand,
  ValidateCliError,
  RESERVED_COMMANDS,
  ReservedNotImplementedError,
  doctor,
  formatDoctorHuman,
} from "./index.js";

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

program
  .command("compose <spec_id>")
  .description("Run an atomic compose on an existing spec file")
  .option("--dry-run", "Validate without writing (equivalent to `composer validate`)")
  .option("--json", "Machine-readable output")
  .action(async (specId: string, opts: { dryRun?: boolean; json?: boolean }) => {
    try {
      const result = await composeCommand({
        projectRoot: process.cwd(),
        specId,
        dryRun: opts.dryRun,
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else if ("preview" in result) {
        process.stdout.write(`composer: dry-run OK — would write\n`);
      } else {
        process.stdout.write(
          `composer: composed ${specId} → ${result.files_written.length} file(s)\n` +
            result.files_written.map((f) => `  ${f.kind} ${f.path}`).join("\n") +
            "\n",
        );
      }
    } catch (err) {
      handleError(err, opts.json);
    }
  });

program
  .command("validate <spec_id>")
  .description("Preview a compose without writing")
  .option("--json", "Machine-readable output")
  .action(async (specId: string, opts: { json?: boolean }) => {
    try {
      const result = await validateCommand({ projectRoot: process.cwd(), specId });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(
          `composer: validate OK — would write ${result.would_write.length} file(s)\n`,
        );
      }
    } catch (err) {
      handleError(err, opts.json);
    }
  });

program
  .command("explain <target>")
  .description("Find the spec node that produced a given <file>:<line> in generated code")
  .option("--json", "Machine-readable output")
  .action((target: string, opts: { json?: boolean }) => {
    try {
      const result = explain({ projectRoot: process.cwd(), target });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(formatExplainHuman(result));
      }
    } catch (err) {
      handleError(err, opts.json);
    }
  });

program
  .command("trace <target>")
  .description("Find every generated output span originating from <spec_id>:<line>")
  .option("--json", "Machine-readable output")
  .action((target: string, opts: { json?: boolean }) => {
    try {
      const result = trace({ projectRoot: process.cwd(), target });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(formatTraceHuman(result));
      }
    } catch (err) {
      handleError(err, opts.json);
    }
  });

program
  .command("doctor")
  .description("Run a workspace health check across 8 dimensions")
  .option("--refresh-parent", "Re-materialize the parent adapter from npm")
  .option("--strict", "Exit non-zero on warnings (default: exit 0 unless errors)")
  .option("--json", "Machine-readable output")
  .action((opts: { refreshParent?: boolean; strict?: boolean; json?: boolean }) => {
    const report = doctor({
      projectRoot: process.cwd(),
      refreshParent: opts.refreshParent,
      strict: opts.strict,
    });
    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      process.stdout.write(formatDoctorHuman(report));
    }
    if (!report.ok) process.exit(1);
  });

// Reserved-namespace stubs (FR-022 / T091). Documented in --help so the CLI
// namespace is stable for v1.x.
for (const reserved of RESERVED_COMMANDS) {
  program
    .command(`${reserved} [args...]`)
    .description(`(reserved for v1.x — not implemented in v0.1)`)
    .action(() => {
      handleError(new ReservedNotImplementedError(reserved), false);
    });
}

program.parseAsync(process.argv).catch((err: unknown) => handleError(err, false));

function handleError(err: unknown, asJson: boolean | undefined): never {
  if (
    err instanceof InitError ||
    err instanceof ExplainError ||
    err instanceof TraceError ||
    err instanceof ComposeCliError ||
    err instanceof ValidateCliError ||
    err instanceof ReservedNotImplementedError
  ) {
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
