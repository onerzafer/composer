// Core types for the ingest SDK. Kept deliberately small — an ingester is a
// codec that turns existing source into *candidate primitive drafts*, which
// land in the engine-ignored quarantine dir until a human `promote`s them.

import type { PrimitiveMeta } from "@composer/adapter-kit";

/**
 * A staged candidate primitive: the Zod-schema TS source, a Handlebars template
 * body, and a metadata stub the human will fill in before `promote`. Written
 * by the ingest writer (draft.ts) to the workspace quarantine.
 */
export interface CandidateDraft {
  /** Primitive name (PascalCase). Drives the draft filename. */
  name: string;
  /** Originating source path, for traceability. */
  source: string;
  /**
   * The Zod schema as TS source — a complete `.ts` file the human reviews and
   * (after edits) `promote` moves into the live catalog as
   * `catalog/primitives/<name>.ts`.
   */
  schemaSource: string;
  /** The Handlebars template body (no banner — the engine adds it on emit). */
  templateSource: string;
  /**
   * Template language extension (the part before `.hbs`), e.g. `"tsx"` for
   * React, `"ts"` for plain TS, `"html.erb"` for Rails. Drives the draft
   * template filename: `<name>.draft.<lang>.hbs`.
   */
  templateLanguage: string;
  /** Metadata stub: `intent`, optional `whenToUse`, etc. Human fills the gaps. */
  meta: Partial<PrimitiveMeta>;
}

/** Per-invocation context handed to a plugin's `ingest()` call. */
export interface IngesterContext {
  /** Project root (where `composer.json` lives). */
  projectRoot: string;
  /** Absolute path to the workspace quarantine dir (`<workspace>/catalog/ingested/`). */
  quarantineDir: string;
}

/** A pluggable ingester — one per target framework/language. */
export interface IngesterPlugin {
  /** Plugin id (matches the CLI argument, e.g. `react`). */
  name: string;
  /** Derive zero or more candidate drafts from a single source path. */
  ingest(sourcePath: string, ctx: IngesterContext): Promise<CandidateDraft[]>;
}
