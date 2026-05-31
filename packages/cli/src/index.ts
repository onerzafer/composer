// @composer/cli — public library exports.
//
// The bin entrypoint lives in `./bin.ts` so tests can import `init` without
// triggering commander's process.argv parsing.

export const CLI_VERSION = "0.1.0-alpha.0";

export {
  init,
  InitError,
  type InitOptions,
  type InitResult,
} from "./commands/init.js";

export {
  promote,
  PromoteError,
  type PromoteOptions,
  type PromoteResult,
} from "./commands/promote.js";

export {
  ingestCommand,
  IngestCliError,
  type IngestCliOptions,
  type IngestCliResult,
} from "./commands/ingest.js";

export {
  explain,
  ExplainError,
  formatExplainHuman,
  type ExplainOptions,
  type ExplainResult,
} from "./commands/explain.js";

export {
  trace,
  TraceError,
  formatTraceHuman,
  type TraceOptions,
  type TraceResult,
} from "./commands/trace.js";

export {
  composeCommand,
  ComposeCliError,
  type ComposeCliOptions,
} from "./commands/compose.js";

export {
  validateCommand,
  ValidateCliError,
  type ValidateCliOptions,
} from "./commands/validate.js";

export {
  RESERVED_COMMANDS,
  ReservedNotImplementedError,
  type ReservedCommand,
} from "./commands/reserved.js";

export {
  doctor,
  formatDoctorHuman,
  type DoctorOptions,
  type DoctorReport,
  type DoctorIssue,
  type Severity,
} from "./commands/doctor.js";

export {
  runGrammar,
  grammarCheck,
  grammarPaths,
  formatQualityReport,
  GrammarCliError,
  type GrammarCheckOptions,
  type GrammarPaths,
  type GrammarRouteResult,
} from "./commands/grammar.js";
