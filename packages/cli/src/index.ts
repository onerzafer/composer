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
