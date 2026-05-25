// T033 — Pipeline phase: structural validation via Zod parse.

import type { CompiledCatalog } from "@composer/typescript";

export interface StructuralResult {
  parsed: unknown;
}

export interface StructuralIssue {
  path: string;
  message: string;
}

export class StructuralValidationError extends Error {
  readonly code = "STRUCTURAL_INVALID" as const;
  constructor(public readonly issues: StructuralIssue[]) {
    super(
      "STRUCTURAL_INVALID: " +
        issues.map((i) => `${i.path || "/"} ${i.message}`).join("; "),
    );
    this.name = "StructuralValidationError";
  }
}

export function structuralValidate(
  catalog: CompiledCatalog,
  json: unknown,
): StructuralResult {
  const result = (catalog.index as { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: { path: (string | number)[]; message: string }[] } } }).safeParse(json);
  if (!result.success) {
    const issues = (result.error?.issues ?? []).map((i) => ({
      path: i.path.map(String).join("."),
      message: i.message,
    }));
    throw new StructuralValidationError(issues);
  }
  return { parsed: result.data };
}
