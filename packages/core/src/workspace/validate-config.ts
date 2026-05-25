// T014 — composer.json schema validator.
//
// JSON Schema source-of-truth: specs/001-composer-toolkit-v0/contracts/composer-json.schema.json
// The schema is small (3 fields with regex patterns); hand-validating is cheaper
// than pulling in Ajv + dealing with its ESM-default-export interop.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ComposerConfig {
  workspace: string;
  engine: string;
  extends?: string | null;
  $schema?: string;
}

const WORKSPACE_PATTERN = /^\.\/[^/].*$|^[^/].*$/;
const ENGINE_PATTERN = /^@composer\/typescript@\d+$/;
const EXTENDS_PATTERN = /^(@[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9-]*@\d+$/;

const ALLOWED_KEYS = new Set(["workspace", "engine", "extends", "$schema"]);

export interface ValidationIssue {
  field: string;
  message: string;
}

export class ComposerConfigError extends Error {
  constructor(
    message: string,
    public readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = "ComposerConfigError";
  }
}

export function validateComposerConfig(value: unknown): ComposerConfig {
  const issues: ValidationIssue[] = [];

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ComposerConfigError("composer.json must be a JSON object");
  }
  const v = value as Record<string, unknown>;

  for (const key of Object.keys(v)) {
    if (!ALLOWED_KEYS.has(key)) {
      issues.push({ field: key, message: `unknown property "${key}"` });
    }
  }

  if (typeof v["workspace"] !== "string") {
    issues.push({ field: "workspace", message: "must be a string (path)" });
  } else if (!WORKSPACE_PATTERN.test(v["workspace"])) {
    issues.push({
      field: "workspace",
      message: `must match ${WORKSPACE_PATTERN.source} (relative path)`,
    });
  }

  if (typeof v["engine"] !== "string") {
    issues.push({ field: "engine", message: "must be a string" });
  } else if (!ENGINE_PATTERN.test(v["engine"])) {
    issues.push({
      field: "engine",
      message: `must match ${ENGINE_PATTERN.source} (e.g., "@composer/typescript@1")`,
    });
  }

  if (v["extends"] !== undefined && v["extends"] !== null) {
    if (typeof v["extends"] !== "string") {
      issues.push({ field: "extends", message: "must be a string, null, or omitted" });
    } else if (!EXTENDS_PATTERN.test(v["extends"])) {
      issues.push({
        field: "extends",
        message: `must match ${EXTENDS_PATTERN.source} (e.g., "@composer/adapter-next@1")`,
      });
    }
  }

  if (v["$schema"] !== undefined && typeof v["$schema"] !== "string") {
    issues.push({ field: "$schema", message: "must be a string if present" });
  }

  if (issues.length > 0) {
    const summary = issues.map((i) => `${i.field}: ${i.message}`).join("; ");
    throw new ComposerConfigError(
      `composer.json schema validation failed: ${summary}`,
      issues,
    );
  }

  return {
    workspace: v["workspace"] as string,
    engine: v["engine"] as string,
    extends: (v["extends"] as string | null | undefined) ?? null,
    ...(typeof v["$schema"] === "string" ? { $schema: v["$schema"] } : {}),
  };
}

export function readComposerJson(projectRoot: string): ComposerConfig {
  const path = join(projectRoot, "composer.json");
  if (!existsSync(path)) {
    throw new ComposerConfigError(`composer.json not found at ${path}`);
  }
  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ComposerConfigError(
      `composer.json is not valid JSON: ${(err as Error).message}`,
    );
  }
  return validateComposerConfig(parsed);
}
