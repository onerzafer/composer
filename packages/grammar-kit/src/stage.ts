// Stage a grammar-authored draft into 003's staging area (T014, 004 US1).
//
// grammar-kit is the *forward* authoring assist (intent → grammar); 003's
// ingest-kit is the *reverse* one (code → grammar). Both converge on ONE staging
// dir + ONE `promote` gate. So grammar.author does not invent a second staging
// mechanism — it reuses `@composer/ingest-kit`'s `writeDraft`, which writes only
// to `design/catalog/ingested/` (engine-ignored → FR-003 / SC-003 inertness).

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { writeDraft, type CandidateDraft } from "@composer/ingest-kit";

export interface StageOptions {
  /** Project root containing `composer.json`. */
  projectRoot: string;
  /** The drafted primitive (Zod schema source + template + metadata stub). */
  draft: CandidateDraft;
}

export interface StageResult {
  ok: true;
  name: string;
  schemaPath: string;
  templatePath: string;
}

export class GrammarStageError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "GrammarStageError";
    this.exitCode = exitCode;
  }
}

/** Resolve `<workspace>/catalog/ingested/` from the project's `composer.json`. */
export function resolveStagingDir(projectRoot: string): string {
  const composerJsonPath = join(projectRoot, "composer.json");
  if (!existsSync(composerJsonPath)) {
    throw new GrammarStageError(
      `grammar: no composer.json found at ${composerJsonPath}`,
      6,
    );
  }
  const composerJson = JSON.parse(readFileSync(composerJsonPath, "utf8")) as {
    workspace?: string;
  };
  const workspaceRel = composerJson.workspace ?? "./design";
  const workspaceRoot = join(
    projectRoot,
    workspaceRel.startsWith("./") ? workspaceRel.slice(2) : workspaceRel,
  );
  return join(workspaceRoot, "catalog", "ingested");
}

/**
 * Write a grammar-authored draft to the shared 003 staging dir. The draft is
 * inert until a human runs `composer promote` (the gate — FR-004).
 */
export function stageDraft(options: StageOptions): StageResult {
  const projectRoot = resolve(options.projectRoot);
  const stagingDir = resolveStagingDir(projectRoot);
  const written = writeDraft(options.draft, stagingDir);
  return {
    ok: true,
    name: options.draft.name,
    schemaPath: written.schemaPath,
    templatePath: written.templatePath,
  };
}
