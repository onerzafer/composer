// @composer/adapter-kit — public types for adapter authors
// Derived from data-model.md (entities §1–§12) and contracts/mcp-tools.md.

import type { z } from "zod";

export type SemVer = string;
export type SpecId = string;
export type PrimitiveName = string;

/** One row of a slot family — e.g., `{ importPath: "@/heroes", exportName: "CenteredHero" }`. */
export interface SlotEntry {
  importPath: string;
  exportName: string;
}

/** family → variant → SlotEntry. e.g., `HERO_VARIANTS.centered`. */
export type SlotRegistry = Record<string, Record<string, SlotEntry>>;

/** Metadata sidecar for one primitive — drives both the agent prompt (via scaffold)
 * and IDE/docs surfaces. Per README §4 and constitution X ("Catalog Is the API"). */
export interface PrimitiveMeta {
  primitive: PrimitiveName;
  version: SemVer;
  intent: string;
  whenToUse: string;
  whenNotToUse: string[];
  fieldGuidance: Record<string, string>;
  examples: unknown[];
  pure?: boolean;
  effects?: string[];
}

/** Per-primitive prep function — sandboxed at runtime per FR-011/017. */
export type PrepFn<TNode = Record<string, unknown>> = (
  node: TNode,
  ctx: { slots: SlotRegistry; tokens: Record<string, unknown> },
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/** Where one rendered file lands on disk. */
export interface OutputPath {
  path: string;
  language: string;
  policy?: "overwrite" | "one-shot";
}

/** Resolves one spec-node to its emitted file paths. */
export type OutputMapFn = (node: Record<string, unknown>) => OutputPath[];

export interface OutputMap {
  byPrimitive: Record<PrimitiveName, OutputMapFn>;
  /** Where specs live; default "specs". */
  specsDir?: string;
}

export interface AuditError {
  path: string | null;
  message: string;
  suggestion?: string;
}

export interface AuditWarning {
  path: string | null;
  message: string;
}

export interface AuditResult {
  ok: boolean;
  errors: AuditError[];
  warnings: AuditWarning[];
}

/** Cross-spec or project-wide audit. Runs in pipeline phase 6. */
export type AuditRule = (workspace: {
  catalog: unknown;
  specs: { id: string; json: unknown }[];
  tokens: Record<string, unknown>;
}) => AuditResult | Promise<AuditResult>;

export interface BootstrapContext {
  projectRoot: string;
  workspaceRoot: string;
  composerJsonPath: string;
}

/** Adapter init hook — runs once on `composer init --extends`. */
export type BootstrapFn = (ctx: BootstrapContext) => Promise<void> | void;

export interface AdapterCatalog {
  primitives?: Record<PrimitiveName, { schema: z.ZodTypeAny; meta: PrimitiveMeta }>;
  rules?: ((root: unknown) => void)[];
  slotRegistry?: SlotRegistry;
  // The discriminated union index — `z.discriminatedUnion("primitive", [...])`.
  // Typed loosely here because Zod's generic for discriminatedUnion is hard to express.
  index?: z.ZodTypeAny;
}

/** Full adapter shape — both published and project-local follow this. */
export interface Adapter {
  name: string;
  version: SemVer;
  catalog?: AdapterCatalog;
  outputMap?: OutputMap;
  audit?: AuditRule | null;
  bootstrap?: BootstrapFn | null;
}
