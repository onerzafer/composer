// T042 — `validate()` endpoint (FR-004, FR-OBS-003, FR-CONC-004).
//
// Side-effect-free dry-run. Runs structural + semantic + audit + render +
// drift-check, but never writes spec/output files and never acquires the
// workspace lock. Writes ONE log file under .composer/logs/.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { compileCatalog, loadCatalog } from "@composer/typescript";
import type { OutputMap, SlotRegistry } from "@composer/adapter-kit";
import { resolveWorkspace } from "../workspace/resolve.js";
import { layerWorkspace } from "../workspace/layer.js";
import { assertValidSpecId } from "../workspace/spec-id.js";
import { Logger, buildLogPath } from "../log/logger.js";
import { ENGINE_VERSION } from "../version.js";
import { structuralValidate, StructuralValidationError } from "../pipeline/phases/structural.js";
import { semanticValidate, SemanticValidationError } from "../pipeline/phases/semantic.js";
import { runAudit, AuditFailedError } from "../pipeline/phases/audit.js";
import { renderSpec, RenderFailedError } from "../pipeline/phases/render.js";
import { driftCheck, DriftDetectedError } from "../pipeline/phases/drift.js";

export interface ValidateError {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidateWarning {
  path: string;
  message: string;
}

export interface ValidateWouldWrite {
  path: string;
  kind: "created" | "updated";
  diff: string;
}

export interface ValidateResult {
  ok: boolean;
  errors: ValidateError[];
  warnings: ValidateWarning[];
  would_write: ValidateWouldWrite[];
  log: string;
  suggested_next: "compose" | "scaffold";
}

export async function validate(
  projectRoot: string,
  specId: string,
  json: unknown,
): Promise<ValidateResult> {
  assertValidSpecId(specId);

  const errors: ValidateError[] = [];
  const warnings: ValidateWarning[] = [];
  const wouldWrite: ValidateWouldWrite[] = [];

  const resolved = resolveWorkspace(projectRoot);
  const workspace = layerWorkspace(resolved.workspaceRoot);

  const logPath = buildLogPath(resolved.workspaceRoot, specId, "validate");
  const logger = new Logger(
    {
      timestamp: new Date().toISOString(),
      surface: "cli",
      engine_version: ENGINE_VERSION,
      adapter_version: resolved.config.extends ?? null,
      node_version: process.version,
      pid: process.pid,
    },
    { id: specId, path: null, hash: null },
    logPath,
  );

  try {
    const tCatalog = Date.now();
    const loaded = await loadCatalog(join(workspace.root, "catalog"));
    const catalog = compileCatalog(loaded);
    logger.recordPhase({
      phase: "compile-catalog",
      duration_ms: Date.now() - tCatalog,
      outcome: "ok",
    });

    const { parsed } = structuralValidate(catalog, json);
    logger.recordPhase({
      phase: "structural-validate",
      duration_ms: 0,
      outcome: "ok",
    });

    semanticValidate(catalog, parsed);
    logger.recordPhase({
      phase: "semantic-validate",
      duration_ms: 0,
      outcome: "ok",
    });

    await runAudit([], { catalog, specs: [], tokens: workspace.tokens });
    logger.recordPhase({
      phase: "audit",
      duration_ms: 0,
      outcome: "ok",
    });

    const outputMap = await loadOutputMap(workspace.outputMapPath);
    const slotRegistry = extractSlotRegistry(loaded.module);

    const rendered = await renderSpec({
      workspace,
      catalog,
      outputMap,
      slotRegistry,
      specId,
      specRelPath: `specs/${specId}.json`,
      json: parsed,
    });
    logger.recordPhase({
      phase: "render-staging",
      duration_ms: 0,
      outcome: "ok",
      meta: { fileCount: rendered.length },
    });

    const previousHashes = loadOutputHashes(workspace.root);
    driftCheck({ projectRoot: resolved.projectRoot, rendered, previousHashes });
    logger.recordPhase({
      phase: "drift-check",
      duration_ms: 0,
      outcome: "ok",
    });

    for (const file of rendered) {
      const absPath = join(resolved.projectRoot, file.path);
      const existed = existsSync(absPath);
      wouldWrite.push({
        path: file.path,
        kind: existed ? "updated" : "created",
        diff: existed
          ? buildShortDiff(readFileSync(absPath, "utf8"), file.content)
          : file.content.slice(0, 1000),
      });
    }
  } catch (err) {
    collectValidationError(err, errors);
    logger.recordError({
      phase: null,
      path: null,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  logger.finalize(errors.length === 0 ? "ok" : "error");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    would_write: wouldWrite,
    log: logger.logFilePath,
    suggested_next: errors.length === 0 ? "compose" : "scaffold",
  };
}

function collectValidationError(err: unknown, errors: ValidateError[]): void {
  if (err instanceof StructuralValidationError) {
    for (const issue of err.issues) {
      errors.push({ path: issue.path, message: issue.message });
    }
    return;
  }
  if (err instanceof SemanticValidationError) {
    for (const issue of err.issues) {
      errors.push({
        path: issue.path,
        message: issue.message,
        ...(issue.suggestion !== undefined ? { suggestion: issue.suggestion } : {}),
      });
    }
    return;
  }
  if (err instanceof AuditFailedError) {
    for (const e of err.result.errors) {
      errors.push({
        path: e.path ?? "(audit)",
        message: e.message,
        ...(e.suggestion !== undefined ? { suggestion: e.suggestion } : {}),
      });
    }
    return;
  }
  if (err instanceof RenderFailedError) {
    errors.push({ path: "(render)", message: err.message });
    return;
  }
  if (err instanceof DriftDetectedError) {
    for (const issue of err.issues) {
      errors.push({
        path: issue.path,
        message: `DRIFT_DETECTED: ${issue.path} has been hand-edited`,
      });
    }
    return;
  }
  errors.push({ path: "/", message: err instanceof Error ? err.message : String(err) });
}

async function loadOutputMap(path: string): Promise<OutputMap> {
  const baseUrl = pathToFileURL(dirname(path) + "/").href;
  const mod = (await tsImport(path, baseUrl)) as Record<string, unknown>;
  return (mod["default"] ?? mod) as OutputMap;
}

function extractSlotRegistry(catalogModule: Record<string, unknown>): SlotRegistry {
  const sr = catalogModule["SLOT_REGISTRY"];
  if (sr && typeof sr === "object" && !Array.isArray(sr)) {
    return sr as SlotRegistry;
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

function buildShortDiff(actual: string, expected: string): string {
  const aLines = actual.split("\n");
  const eLines = expected.split("\n");
  const out: string[] = [];
  const max = Math.max(aLines.length, eLines.length);
  for (let i = 0; i < max && out.length < 20; i++) {
    const a = aLines[i] ?? "<EOF>";
    const e = eLines[i] ?? "<EOF>";
    if (a !== e) {
      out.push(`- ${a}`);
      out.push(`+ ${e}`);
    }
  }
  return out.join("\n");
}
