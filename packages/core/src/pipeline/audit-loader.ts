// Shared audit-chain + sibling-spec loading, used by both `compose()`
// (orchestrator.ts) and `validate()` (../api/validate.ts) so the two entry
// points run the identical adapter+project audit chain against the identical
// spec set. Extracted from orchestrator.ts to fix validate() calling
// runAudit([], { specs: [] }) — a no-op that silently skipped every audit
// compose() would have run.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import type { AuditRule } from "@composer/adapter-kit";
import type { EffectiveWorkspace } from "../workspace/layer.js";

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
  let exported = (mod["default"] ?? mod["audit"]) as unknown;
  // Same CommonJS-host interop unwrap as loadOutputMap: in a CJS host the audit
  // function may be nested one `default` deeper.
  if (typeof exported !== "function" && exported && typeof exported === "object") {
    const inner =
      (exported as Record<string, unknown>)["default"] ??
      (exported as Record<string, unknown>)["audit"];
    if (typeof inner === "function") exported = inner;
  }
  if (typeof exported !== "function") {
    throw new Error(`Audit module ${path} does not export a default audit function`);
  }
  AUDIT_MODULE_CACHE.set(path, exported as AuditRule);
  return exported as AuditRule;
}

/** Load the adapter+project audit chain — parent first, then project
 * (US3 Acceptance #3). Returns an empty chain when neither ships an audit.ts. */
export async function loadAuditChain(workspace: EffectiveWorkspace): Promise<AuditRule[]> {
  const rules: AuditRule[] = [];
  if (workspace.parentAuditPath) {
    rules.push(await loadAuditModule(workspace.parentAuditPath));
  }
  if (workspace.auditPath) {
    rules.push(await loadAuditModule(workspace.auditPath));
  }
  return rules;
}

/** Load every other spec already on disk in the workspace, so cross-spec
 * audits (e.g., unique-name rules) see the full workspace state. Excludes
 * `excludeId` because the caller supplies that spec's own (parsed) JSON. */
export function loadSiblingSpecs(
  workspaceRoot: string,
  excludeId: string,
): { id: string; json: unknown }[] {
  const specsDir = join(workspaceRoot, "specs");
  if (!existsSync(specsDir)) return [];
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
