// T034 — Pipeline phase: semantic validation (superRefine + project rules).
//
// v0.1 minimum: catalog semantic rules ride inside Zod's `superRefine` on
// individual primitive schemas, which already run during the structural phase.
// Project-wide semantic rules (cross-primitive, multi-spec) arrive when adapters
// declare them; the data-flow hook is in place.

import type { CompiledCatalog } from "@composer/typescript";

export interface SemanticIssue {
  path: string;
  message: string;
  suggestion?: string;
}

export class SemanticValidationError extends Error {
  readonly code = "SEMANTIC_INVALID" as const;
  constructor(public readonly issues: SemanticIssue[]) {
    super(
      "SEMANTIC_INVALID: " +
        issues.map((i) => `${i.path} ${i.message}`).join("; "),
    );
    this.name = "SemanticValidationError";
  }
}

/**
 * Run cross-cutting semantic rules. v0.1 is a pass-through; rules-from-workspace
 * lookup hooks in when adapters/projects declare them via the catalog module.
 */
export function semanticValidate(_catalog: CompiledCatalog, _parsed: unknown): void {
  // Pass-through: superRefine ran in structural; cross-cutting rules
  // belong in audit (see audit.ts).
}
