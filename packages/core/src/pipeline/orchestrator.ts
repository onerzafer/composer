// T032 — Pipeline orchestrator.
//
// Wires the 7 phases (resolve, compile, structural, semantic, audit, render,
// drift, commit). Acquires the workspace lock for compose, NOT for validate
// (FR-CONC-004). On any failure, the lock is released and nothing is committed.

import { existsSync, readFileSync, readdirSync } from "node:fs";
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
import type { AuditRule } from "@composer/adapter-kit";
import { WorkspaceLock, LockHeldError } from "../lock/workspace-lock.js";
import { Logger, buildLogPath } from "../log/logger.js";
import { structuralValidate, StructuralValidationError } from "./phases/structural.js";
import { semanticValidate, SemanticValidationError } from "./phases/semantic.js";
import { runAudit, AuditFailedError } from "./phases/audit.js";
import { renderSpec, RenderFailedError, type RenderedFile } from "./phases/render.js";
import { driftCheck, DriftDetectedError } from "./phases/drift.js";
import { commit, type CommittedFile } from "./phases/commit.js";

export interface ComposeOptions {
  projectRoot: string;
  specId: string;
  json: unknown;
  surface: "mcp" | "cli";
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

  const lockPath = join(resolved.workspaceRoot, ".composer", "cache", "compose.lock");
  const lock = new WorkspaceLock(lockPath);
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

  try {
    return await runPipeline(opts, resolved, workspace, logger);
  } catch (err) {
    logger.recordError({
      phase: phaseFromError(err),
      path: null,
      message: err instanceof Error ? err.message : String(err),
    });
    logger.finalize("error");
    throw err;
  } finally {
    lock.release();
  }
}

function phaseFromError(err: unknown): import("../log/logger.js").PhaseName | null {
  if (err instanceof StructuralValidationError) return "structural-validate";
  if (err instanceof SemanticValidationError) return "semantic-validate";
  if (err instanceof AuditFailedError) return "audit";
  if (err instanceof RenderFailedError) return "render-staging";
  if (err instanceof DriftDetectedError) return "drift-check";
  return null;
}

async function runPipeline(
  opts: ComposeOptions,
  resolved: ResolvedWorkspace,
  workspace: EffectiveWorkspace,
  logger: Logger,
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

  // Phase: audit — parent first, then project (US3 Acceptance #3).
  const tAudit = Date.now();
  const auditRules = await loadAuditChain(workspace);
  const allSpecs = [{ id: opts.specId, json: parsed }, ...loadSiblingSpecs(workspace.root, opts.specId)];
  await runAudit(auditRules, { catalog, specs: allSpecs, tokens: workspace.tokens });
  logger.recordPhase({
    phase: "audit",
    duration_ms: Date.now() - tAudit,
    outcome: "ok",
    meta: { auditCount: auditRules.length },
  });

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
    audit: { ok: true, warnings: [] },
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
  const exported = (mod["default"] ?? mod) as OutputMap;
  return exported;
}

async function loadAuditChain(workspace: EffectiveWorkspace): Promise<AuditRule[]> {
  const rules: AuditRule[] = [];
  if (workspace.parentAuditPath) {
    rules.push(await loadAuditModule(workspace.parentAuditPath));
  }
  if (workspace.auditPath) {
    rules.push(await loadAuditModule(workspace.auditPath));
  }
  return rules;
}

/** Process-local cache for loaded audit modules. The tsx loader has a known
 * deadlock when its module cache is queried under certain repeat-load patterns
 * (the 3rd-compose hang surfaced wiring T077); avoiding the round-trip
 * eliminates the trigger. */
const AUDIT_MODULE_CACHE = new Map<string, AuditRule>();

async function loadAuditModule(path: string): Promise<AuditRule> {
  const cached = AUDIT_MODULE_CACHE.get(path);
  if (cached) return cached;

  // Prefer native dynamic-import on shipped .js — fast and never deadlocks.
  // For .ts (project-authored), fall back to tsImport.
  let mod: Record<string, unknown>;
  if (path.endsWith(".js")) {
    mod = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  } else {
    const baseUrl = pathToFileURL(dirname(path) + "/").href;
    mod = (await tsImport(path, baseUrl)) as Record<string, unknown>;
  }
  const exported = (mod["default"] ?? mod["audit"]) as AuditRule | undefined;
  if (typeof exported !== "function") {
    throw new Error(`Audit module ${path} does not export a default audit function`);
  }
  AUDIT_MODULE_CACHE.set(path, exported);
  return exported;
}

function loadSiblingSpecs(
  workspaceRoot: string,
  excludeId: string,
): { id: string; json: unknown }[] {
  const specsDir = join(workspaceRoot, "specs");
  if (!existsSync(specsDir)) return [];
  // Read all existing specs so cross-spec audits (e.g., unique-name rules)
  // see the full workspace state. Excludes the spec under compose because
  // the caller already added the new (parsed) version.
  const out: { id: string; json: unknown }[] = [];
  for (const entry of readdirSync(specsDir)) {
    if (!entry.endsWith(".json")) continue;
    const id = entry.replace(/\.json$/, "");
    if (id === excludeId) continue;
    try {
      const json = JSON.parse(readFileSync(join(specsDir, entry), "utf8"));
      out.push({ id, json });
    } catch {
      /* skip malformed */
    }
  }
  return out;
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
