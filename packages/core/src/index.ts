// @composer/core — engine library
//
// v0.1 public API. Phase 2 (Foundational) + Phase 3 (US1 endpoints + pipeline).

export { ENGINE_VERSION } from "./version.js";

// Workspace
export {
  readComposerJson,
  validateComposerConfig,
  ComposerConfigError,
  type ComposerConfig,
  type ComposerLimits,
  type ValidationIssue,
} from "./workspace/validate-config.js";

// Config — compose/lock limits (TTL + budget) resolution
export {
  resolveLimits,
  DEFAULT_LIMITS,
  DEFAULT_MAX_COMPOSE_DURATION_MS,
  DEFAULT_MAX_HOLD_MS,
  ENV_MAX_COMPOSE_DURATION_MS,
  ENV_MAX_HOLD_MS,
  type EffectiveLimits,
} from "./config/limits.js";
export { isValidSpecId, assertValidSpecId } from "./workspace/spec-id.js";
export { assertWithinProject } from "./workspace/path-safety.js";
export { resolveWorkspace, type ResolvedWorkspace } from "./workspace/resolve.js";
export { layerWorkspace, type EffectiveWorkspace } from "./workspace/layer.js";
export {
  resolveAndCacheParent,
  resolveParentPackage,
  walkExtendsChain,
  stripVersionPin,
  ExtendsResolutionError,
  ExtendsCycleError,
  type ResolvedParent,
} from "./workspace/extends.js";

// Lock
export {
  WorkspaceLock,
  LockHeldError,
  withWorkspaceLock,
  type LockData,
} from "./lock/workspace-lock.js";

// Drift
export { hashFile, hashContent } from "./drift/hasher.js";
export {
  buildDriftAbortReport,
  formatDriftAbortHuman,
  type DriftAbortReport,
} from "./drift/abort.js";
export {
  emptyHashStore,
  hashStorePath,
  loadHashStore,
  recordCompose,
  saveHashStore,
  type OutputHashStore,
} from "./drift/hashes.js";

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
  PrepStageError,
  type SandboxContext,
  type PrepFailureStage,
} from "./render/sandbox.js";
export {
  loadPrep,
  _resetPrepCacheForTests,
  type LoadedPrep,
} from "./render/prep-loader.js";
export { buildBanner, buildBlockComment, type BlockMarker } from "./render/banner.js";

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

// Pipeline (low-level)
export {
  orchestrateCompose,
  LockHeldExposedError,
  ComposeTimeoutError,
  type ComposeOptions,
  type ComposeResult,
} from "./pipeline/orchestrator.js";
export {
  structuralValidate,
  StructuralValidationError,
  type StructuralResult,
  type StructuralIssue,
} from "./pipeline/phases/structural.js";
export {
  semanticValidate,
  SemanticValidationError,
  type SemanticIssue,
} from "./pipeline/phases/semantic.js";
export {
  runAudit,
  AuditFailedError,
  type AuditWorkspaceState,
} from "./pipeline/phases/audit.js";
export {
  renderSpec,
  RenderFailedError,
  type RenderInput,
  type RenderedFile,
} from "./pipeline/phases/render.js";
export {
  driftCheck,
  DriftDetectedError,
  type DriftIssue,
  type DriftCheckInput,
} from "./pipeline/phases/drift.js";
export {
  commit,
  type CommitInput,
  type CommitResult,
  type CommittedFile,
} from "./pipeline/phases/commit.js";

// Agent API (high-level)
export { discover, type DiscoverResult, type DiscoverPrimitive, type DiscoverSpec } from "./api/discover.js";
export {
  scaffold,
  type ScaffoldInput,
  type ScaffoldResult,
  type ScaffoldPrimitiveResult,
  type ScaffoldSpecResult,
} from "./api/scaffold.js";
export {
  validate,
  type ValidateResult,
  type ValidateError,
  type ValidateWarning,
  type ValidateWouldWrite,
} from "./api/validate.js";
export { compose } from "./api/compose.js";
