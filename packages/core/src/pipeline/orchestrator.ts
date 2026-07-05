// T032 — Pipeline orchestrator.
//
// Wires the 7 phases (resolve, compile, structural, semantic, audit, render,
// drift, commit). Acquires the workspace lock for compose, NOT for validate
// (FR-CONC-004). On any failure, the lock is released and nothing is committed.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { compileCatalog, loadCatalog, type CompiledCatalog } from "@composer/typescript";
import type { OutputMap } from "@composer/adapter-kit";
import { ENGINE_VERSION } from "../version.js";
import { resolveWorkspace, type ResolvedWorkspace } from "../workspace/resolve.js";
import { layerWorkspace, type EffectiveWorkspace } from "../workspace/layer.js";
import { resolveAndCacheParent, type ResolvedParent } from "../workspace/extends.js";
import { assertValidSpecId } from "../workspace/spec-id.js";
import { WorkspaceLock, LockHeldError } from "../lock/workspace-lock.js";
import { resolveLimits } from "../config/limits.js";
import { Logger, buildLogPath } from "../log/logger.js";
import { structuralValidate, StructuralValidationError } from "./phases/structural.js";
import { semanticValidate, SemanticValidationError } from "./phases/semantic.js";
import { runAudit, AuditFailedError } from "./phases/audit.js";
import { renderSpec, RenderFailedError, type RenderedFile } from "./phases/render.js";
import { driftCheck, DriftDetectedError } from "./phases/drift.js";
import { commit, CommitRenameError, type CommittedFile } from "./phases/commit.js";
import { loadAuditChain, loadSiblingSpecs } from "./audit-loader.js";

export interface ComposeOptions {
  projectRoot: string;
  specId: string;
  json: unknown;
  surface: "mcp" | "cli";
  /** `--strict`: escalate any audit warning into an audit failure (AuditFailedError, exit 3). */
  strict?: boolean;
}

export interface ComposeResult {
  spec_saved: string;
  files_written: CommittedFile[];
  audit: { ok: true; warnings: { path: string | null; message: string }[] };
  log: string;
  suggested_next: "done";
}

export class LockHeldExposedError extends Error {
  readonly code = "LOCK_HELD" as const;
  constructor(public readonly lockMessage: string) {
    super(`LOCK_HELD: ${lockMessage}`);
    this.name = "LockHeldExposedError";
  }
}

/** Thrown when a compose exceeds its wall-clock budget (FR-004). The lock is
 * always released before this propagates (FR-008). */
export class ComposeTimeoutError extends Error {
  readonly code = "COMPOSE_TIMEOUT" as const;
  constructor(
    public readonly durationMs: number,
    public readonly specId: string,
    public readonly surface: "mcp" | "cli",
  ) {
    super(
      `COMPOSE_TIMEOUT: compose for "${specId}" exceeded ${durationMs}ms budget (surface ${surface})`,
    );
    this.name = "ComposeTimeoutError";
  }
}

/** A promise that rejects with the signal's reason when (or if already) aborted. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

export async function orchestrateCompose(opts: ComposeOptions): Promise<ComposeResult> {
  assertValidSpecId(opts.specId);

  const phase0Start = Date.now();
  const resolved = resolveWorkspace(opts.projectRoot);
  let parent: ResolvedParent | null = null;
  if (resolved.config.extends) {
    parent = resolveAndCacheParent(resolved.projectRoot, resolved.config.extends);
  }
  const workspace = layerWorkspace(resolved.workspaceRoot, parent);
  const phase0Duration = Date.now() - phase0Start;

  const logPath = buildLogPath(resolved.workspaceRoot, opts.specId, "compose");
  const logger = new Logger(
    {
      timestamp: new Date().toISOString(),
      surface: opts.surface,
      engine_version: ENGINE_VERSION,
      adapter_version: resolved.config.extends ?? null,
      node_version: process.version,
      pid: process.pid,
    },
    {
      id: opts.specId,
      path: `${resolved.config.workspace.replace(/^\.\//, "")}/specs/${opts.specId}.json`,
      hash: null,
    },
    logPath,
  );

  logger.recordPhase({
    phase: "resolve-workspace",
    duration_ms: phase0Duration,
    outcome: "ok",
  });

  const limits = resolveLimits(resolved.config);
  const lockPath = join(resolved.workspaceRoot, ".composer", "cache", "compose.lock");
  const lock = new WorkspaceLock(lockPath, { maxHoldMs: limits.maxHoldMs });
  try {
    lock.acquire({
      pid: process.pid,
      surface: opts.surface,
      spec_id: opts.specId,
    });
  } catch (err) {
    if (err instanceof LockHeldError) {
      logger.recordError({
        phase: null,
        path: null,
        message: err.message,
      });
      logger.finalize("error");
      throw new LockHeldExposedError(err.message);
    }
    throw err;
  }

  // Bound the compose under a wall-clock budget (FR-004). On expiry the timer aborts
  // the controller; the race below stops waiting, the lock is released (ownership-checked)
  // in `finally`, and ComposeTimeoutError propagates to the caller (FR-005/FR-008).
  const controller = new AbortController();
  const timeoutError = new ComposeTimeoutError(
    limits.maxComposeDurationMs,
    opts.specId,
    opts.surface,
  );
  const timer = setTimeout(() => controller.abort(timeoutError), limits.maxComposeDurationMs);
  if (typeof timer.unref === "function") timer.unref();
  const disarm = (): void => clearTimeout(timer);

  try {
    const pipelinePromise = runPipeline(opts, resolved, workspace, logger, controller.signal, disarm);
    // Swallow a late rejection of the abandoned pipeline if it resolves post-timeout
    // (its pre-commit throwIfAborted will reject) so it does not surface as unhandled.
    pipelinePromise.catch(() => {});
    return await Promise.race([pipelinePromise, rejectOnAbort(controller.signal)]);
  } catch (err) {
    logger.recordError({
      phase: phaseFromError(err),
      path: null,
      message: err instanceof Error ? err.message : String(err),
    });
    logger.finalize("error");
    throw err;
  } finally {
    clearTimeout(timer);
    lock.release();
  }
}

function phaseFromError(err: unknown): import("../log/logger.js").PhaseName | null {
  if (err instanceof StructuralValidationError) return "structural-validate";
  if (err instanceof SemanticValidationError) return "semantic-validate";
  if (err instanceof AuditFailedError) return "audit";
  if (err instanceof RenderFailedError) return "render-staging";
  if (err instanceof DriftDetectedError) return "drift-check";
  if (err instanceof CommitRenameError) return "atomic-commit";
  return null;
}

async function runPipeline(
  opts: ComposeOptions,
  resolved: ResolvedWorkspace,
  workspace: EffectiveWorkspace,
  logger: Logger,
  signal: AbortSignal,
  disarm: () => void,
): Promise<ComposeResult> {
  // Phase: compile catalog — uses the layered catalog path (project's if
  // present, else parent's). loadCatalog takes the catalog directory, so we
  // strip the trailing `/index.ts`.
  const tCatalog = Date.now();
  const loaded = await loadCatalog(dirname(workspace.catalogIndexPath));
  const catalog: CompiledCatalog = compileCatalog(loaded);
  logger.recordPhase({
    phase: "compile-catalog",
    duration_ms: Date.now() - tCatalog,
    outcome: "ok",
    meta: { primitiveCount: catalog.primitives.size },
  });
  signal.throwIfAborted();

  // Phase: structural validate
  const tStructural = Date.now();
  const { parsed } = structuralValidate(catalog, opts.json);
  logger.recordPhase({
    phase: "structural-validate",
    duration_ms: Date.now() - tStructural,
    outcome: "ok",
  });

  // Phase: semantic validate
  const tSemantic = Date.now();
  semanticValidate(catalog, parsed);
  logger.recordPhase({
    phase: "semantic-validate",
    duration_ms: Date.now() - tSemantic,
    outcome: "ok",
  });

  // Phase: audit — parent first, then project (US3 Acceptance #3). Warnings
  // are collected (not discarded) and threaded through to the ComposeResult;
  // `--strict` escalates any of them into an AuditFailedError (exit 3).
  const tAudit = Date.now();
  const auditRules = await loadAuditChain(workspace);
  const allSpecs = [{ id: opts.specId, json: parsed }, ...loadSiblingSpecs(workspace.root, opts.specId)];
  const auditWarnings = await runAudit(
    auditRules,
    { catalog, specs: allSpecs, tokens: workspace.tokens },
    { strict: opts.strict },
  );
  logger.recordPhase({
    phase: "audit",
    duration_ms: Date.now() - tAudit,
    outcome: "ok",
    meta: { auditCount: auditRules.length, warningCount: auditWarnings.length },
  });
  signal.throwIfAborted();

  // Load output map (TS module via tsx)
  const outputMap = await loadOutputMap(workspace.outputMapPath);

  // Phase: render
  const tRender = Date.now();
  const specRelPath = `specs/${opts.specId}.json`;
  const rendered: RenderedFile[] = await renderSpec({
    workspace,
    catalog,
    outputMap,
    slotRegistry: extractSlotRegistry(loaded.module),
    specId: opts.specId,
    specRelPath,
    json: parsed,
  });
  logger.recordPhase({
    phase: "render-staging",
    duration_ms: Date.now() - tRender,
    outcome: "ok",
    meta: { fileCount: rendered.length },
  });
  signal.throwIfAborted();

  // Phase: drift check
  const tDrift = Date.now();
  const previousHashes = loadOutputHashes(workspace.root);
  driftCheck({
    projectRoot: resolved.projectRoot,
    rendered,
    previousHashes,
  });
  logger.recordPhase({
    phase: "drift-check",
    duration_ms: Date.now() - tDrift,
    outcome: "ok",
  });

  // Final abort checkpoint, then disarm: once past here the budget can no longer fire,
  // so a timeout never interleaves with the (bounded, uninterruptible) atomic commit (U1).
  signal.throwIfAborted();
  disarm();

  // Phase: atomic commit
  const tCommit = Date.now();
  const commitResult = commit({
    projectRoot: resolved.projectRoot,
    workspaceRoot: workspace.root,
    specId: opts.specId,
    specJson: parsed,
    specRelPath,
    rendered,
    previousHashes,
  });
  for (const f of commitResult.files_written) logger.recordFile(f);
  logger.recordPhase({
    phase: "atomic-commit",
    duration_ms: Date.now() - tCommit,
    outcome: "ok",
    meta: { fileCount: commitResult.files_written.length },
  });

  logger.finalize("ok");

  return {
    spec_saved: commitResult.spec_saved,
    files_written: commitResult.files_written,
    audit: { ok: true, warnings: auditWarnings },
    log: logger.logFilePath,
    suggested_next: "done",
  };
}

async function loadOutputMap(path: string): Promise<OutputMap> {
  const baseUrl = pathToFileURL(dirname(path) + "/").href;
  // Support both shipped `.js` (parent) and source `.ts` (project) without
  // forcing tsImport on a `.js` path — Node's native loader is faster there.
  let mod: Record<string, unknown>;
  if (path.endsWith(".js")) {
    mod = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  } else {
    mod = (await tsImport(path, baseUrl)) as Record<string, unknown>;
  }
  let exported = (mod["default"] ?? mod) as Record<string, unknown>;
  // CommonJS-host interop: when the host project's package.json has no
  // "type":"module", tsx transpiles this module to CommonJS and Node's CJS→ESM
  // interop double-wraps the default export, yielding `{ default: { byPrimitive }}`.
  // Descend one level when the expected `byPrimitive` shape is nested deeper.
  // Shape-aware so ESM hosts (whose default already has byPrimitive) are untouched.
  if (
    exported &&
    typeof exported === "object" &&
    !("byPrimitive" in exported) &&
    typeof exported["default"] === "object" &&
    exported["default"] !== null &&
    "byPrimitive" in (exported["default"] as Record<string, unknown>)
  ) {
    exported = exported["default"] as Record<string, unknown>;
  }
  return exported as unknown as OutputMap;
}

function extractSlotRegistry(catalogModule: Record<string, unknown>): import("@composer/adapter-kit").SlotRegistry {
  // Catalog modules MAY export a `SLOT_REGISTRY` object. Empty if absent.
  const sr = catalogModule["SLOT_REGISTRY"];
  if (sr && typeof sr === "object" && !Array.isArray(sr)) {
    return sr as import("@composer/adapter-kit").SlotRegistry;
  }
  return {};
}

function loadOutputHashes(workspaceRoot: string): Record<string, string> {
  const path = join(workspaceRoot, ".composer", "cache", "output.hashes.json");
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      hashes?: Record<string, string>;
    };
    return parsed.hashes ?? {};
  } catch {
    return {};
  }
}

// Re-export the engine pipeline helpers used by validate.ts
export { loadOutputMap as _loadOutputMap, loadOutputHashes as _loadOutputHashes };
