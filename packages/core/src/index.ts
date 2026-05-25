// @composer/core — engine library
//
// Public API surface assembled from Foundational (Phase 2) modules.
// Pipeline + agent endpoints land in Phase 3 (US1).

export const ENGINE_VERSION = "0.1.0-alpha.0";

// Workspace
export {
  readComposerJson,
  validateComposerConfig,
  ComposerConfigError,
  type ComposerConfig,
  type ValidationIssue,
} from "./workspace/validate-config.js";
export { isValidSpecId, assertValidSpecId } from "./workspace/spec-id.js";
export { assertWithinProject } from "./workspace/path-safety.js";
export { resolveWorkspace, type ResolvedWorkspace } from "./workspace/resolve.js";
export { layerWorkspace, type EffectiveWorkspace } from "./workspace/layer.js";

// Lock
export {
  WorkspaceLock,
  LockHeldError,
  withWorkspaceLock,
  type LockData,
} from "./lock/workspace-lock.js";

// Drift
export { hashFile, hashContent } from "./drift/hasher.js";

// Log
export {
  Logger,
  buildLogPath,
  type LogEntry,
  type PhaseEntry,
  type PhaseName,
  type Outcome,
  type ErrorEntry,
  type FileWritten,
  type InvocationInfo,
  type SpecInfo,
} from "./log/logger.js";

// Render
export { makeHelpers, registerHelpers, type HelperBindings } from "./render/helpers.js";
export {
  runPrepInSandbox,
  assertPrepShape,
  assertPrepSourceSafe,
  type SandboxContext,
} from "./render/sandbox.js";

// Source map
export {
  emptySourceMap,
  loadSourceMap,
  saveSourceMap,
  sourceMapPath,
  explainAt,
  traceFrom,
  addFileEntries,
  clearFileEntries,
  type SourceMap,
  type FileEntry,
  type SpecEntry,
} from "./sourcemap/persist.js";
