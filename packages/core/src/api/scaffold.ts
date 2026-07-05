// T041 — `scaffold()` endpoint (both variants).
//
// Variant A (kind: "primitive"): return full schema + skeleton + examples +
// fieldGuidance + whenNotToUse for one primitive. Variant B (kind: "spec"):
// return the JSON content of an existing spec (the agent's read endpoint for
// edits, preserving the workflow-only no-escape-hatches contract).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileCatalog, loadCatalog } from "@composer/typescript";
import { resolveWorkspace } from "../workspace/resolve.js";
import { layerWorkspace } from "../workspace/layer.js";
import { assertValidSpecId } from "../workspace/spec-id.js";
import { catalogSchemaToJsonSchema } from "./zod-json-schema.js";

export type ScaffoldInput =
  | { kind: "primitive"; primitive: string; intent?: string }
  | { kind: "spec"; spec_id: string };

export interface ScaffoldPrimitiveResult {
  spec_id: string;
  skeleton: Record<string, unknown>;
  schema: Record<string, unknown>;
  field_guidance: Record<string, string>;
  when_not_to_use: string[];
  examples: unknown[];
  suggested_next: "compose";
}

export interface ScaffoldSpecResult {
  spec_id: string;
  json: unknown;
  suggested_next: "compose";
}

export type ScaffoldResult = ScaffoldPrimitiveResult | ScaffoldSpecResult;

export async function scaffold(
  projectRoot: string,
  input: ScaffoldInput,
): Promise<ScaffoldResult> {
  if (input.kind === "primitive") {
    return scaffoldPrimitive(projectRoot, input.primitive, input.intent);
  }
  if (input.kind === "spec") {
    return scaffoldSpec(projectRoot, input.spec_id);
  }
  throw new Error(
    `INVALID_INPUT_KIND: scaffold requires kind='primitive' or kind='spec'`,
  );
}

async function scaffoldPrimitive(
  projectRoot: string,
  primitiveName: string,
  intent: string | undefined,
): Promise<ScaffoldPrimitiveResult> {
  const resolved = resolveWorkspace(projectRoot);
  const workspace = layerWorkspace(resolved.workspaceRoot);
  const loaded = await loadCatalog(join(workspace.root, "catalog"));
  const catalog = compileCatalog(loaded);

  const schema = catalog.primitives.get(primitiveName);
  if (!schema) {
    throw new Error(
      `PRIMITIVE_NOT_FOUND: "${primitiveName}" is not in the catalog (available: ${[
        ...catalog.primitives.keys(),
      ].join(", ")})`,
    );
  }
  const meta = catalog.meta.get(primitiveName);

  const baseId = deriveSpecId(intent ?? primitiveName);

  return {
    spec_id: baseId,
    skeleton: buildSkeleton(primitiveName, meta?.examples),
    schema: await catalogSchemaToJsonSchema(schema, {
      name: primitiveName,
      catalogDir: loaded.catalogDir,
    }),
    field_guidance: meta?.fieldGuidance ?? {},
    when_not_to_use: meta?.whenNotToUse ?? [],
    examples: meta?.examples ?? [],
    suggested_next: "compose",
  };
}

async function scaffoldSpec(
  projectRoot: string,
  specId: string,
): Promise<ScaffoldSpecResult> {
  assertValidSpecId(specId);
  const resolved = resolveWorkspace(projectRoot);
  const workspace = layerWorkspace(resolved.workspaceRoot);
  const path = join(workspace.root, "specs", `${specId}.json`);
  if (!existsSync(path)) {
    throw new Error(`SPEC_NOT_FOUND: no spec at ${resolved.config.workspace}/specs/${specId}.json`);
  }
  const json = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return { spec_id: specId, json, suggested_next: "compose" };
}

function deriveSpecId(source: string): string {
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "spec";
}

function buildSkeleton(
  primitive: string,
  examples: unknown[] | undefined,
): Record<string, unknown> {
  const first = examples?.[0];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    return first as Record<string, unknown>;
  }
  return { primitive, id: "<FILL>" };
}
