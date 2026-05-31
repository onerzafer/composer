// T010 — `composer promote <draft>` (003 US1).
//
// Moves a quarantined draft into the live catalog. This is the single human
// gate that activates an ingested (or grammar-kit-authored) primitive — see
// 003 spec FR-002 / FR-007.
//
// Behaviour:
//   1. Resolve workspace from composer.json (default `./design`).
//   2. Locate <workspace>/catalog/ingested/<draftName>.draft.ts and the
//      sibling <draftName>.draft.<lang>.hbs template (lang derived from the
//      template filename so the caller doesn't have to know it).
//   3. Refuse if a live primitive of the same lowercase name already exists
//      (collision check — FR-007).
//   4. Move the schema → catalog/primitives/<lowercase>.ts and the template →
//      templates/<lowercase>.<lang>.hbs (matching the engine's lookup convention).
//
// Exit codes follow the contract in specs/003-ingest-promote/.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { gradeDraft } from "@composer/grammar-kit";

export interface PromoteOptions {
  /** Project root containing `composer.json`. */
  projectRoot: string;
  /** The draft name as it appears on disk (e.g. `"Card"`). */
  draftName: string;
  /**
   * Override the 004 FR-007 blocking quality precondition. A draft that fails
   * a blocking quality check (30-line, total-functional, metadata) is refused
   * unless `force: true`, which promotes anyway and records the overridden
   * findings in `PromoteResult.qualityOverride`.
   */
  force?: boolean;
}

export interface PromoteResult {
  ok: true;
  /** Absolute path the schema landed at (catalog/primitives/<lowercase>.ts). */
  schemaTarget: string;
  /** Absolute path the template landed at (templates/<lowercase>.<lang>.hbs). */
  templateTarget: string;
  /** Wall-clock duration of the move. */
  elapsedMs: number;
  /** Quality-gate findings that were overridden via `force` (absent when the gate passed). */
  qualityOverride?: string[];
}

export class PromoteError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "PromoteError";
    this.exitCode = exitCode;
  }
}

// Same allow-list as ingest-kit's writeDraft — paranoid name validation.
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export async function promote(options: PromoteOptions): Promise<PromoteResult> {
  const start = Date.now();

  if (!NAME_PATTERN.test(options.draftName)) {
    throw new PromoteError(
      `promote: invalid draft name ${JSON.stringify(options.draftName)}`,
      1,
    );
  }

  const projectRoot = resolve(options.projectRoot);
  const composerJsonPath = join(projectRoot, "composer.json");
  if (!existsSync(composerJsonPath)) {
    throw new PromoteError(
      `promote: no composer.json found at ${composerJsonPath}`,
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

  const ingestedDir = join(workspaceRoot, "catalog", "ingested");
  if (!existsSync(ingestedDir)) {
    throw new PromoteError(
      `promote: quarantine directory does not exist: ${ingestedDir}`,
      6,
    );
  }

  // Schema draft is deterministic.
  const schemaDraftPath = join(ingestedDir, `${options.draftName}.draft.ts`);
  if (!existsSync(schemaDraftPath)) {
    throw new PromoteError(
      `promote: schema draft not found: ${schemaDraftPath}. ` +
        `(Did you run \`composer ingest\` to produce it?)`,
      6,
    );
  }

  // Template draft: the language extension is part of the filename
  // (<name>.draft.<lang>.hbs). Discover it by scanning the quarantine.
  const tplPrefix = `${options.draftName}.draft.`;
  const tplSuffix = ".hbs";
  const templateEntries = readdirSync(ingestedDir).filter(
    (f) => f.startsWith(tplPrefix) && f.endsWith(tplSuffix) && f !== `${options.draftName}.draft.ts`,
  );
  if (templateEntries.length === 0) {
    throw new PromoteError(
      `promote: template draft not found for ${options.draftName} ` +
        `(expected <name>.draft.<lang>.hbs in ${ingestedDir})`,
      6,
    );
  }
  if (templateEntries.length > 1) {
    throw new PromoteError(
      `promote: ambiguous template drafts for ${options.draftName}: ` +
        `${templateEntries.join(", ")}`,
      6,
    );
  }
  const templateDraftName = templateEntries[0]!;
  const lang = templateDraftName.slice(tplPrefix.length, -tplSuffix.length);
  if (!lang) {
    throw new PromoteError(
      `promote: could not parse template language from ${templateDraftName}`,
      6,
    );
  }

  // Live targets (lowercase basename matches the engine's template lookup).
  const lower = options.draftName.toLowerCase();
  const primitivesDir = join(workspaceRoot, "catalog", "primitives");
  const templatesDir = join(workspaceRoot, "templates");
  const schemaTarget = join(primitivesDir, `${lower}.ts`);
  const templateTarget = join(templatesDir, `${lower}.${lang}.hbs`);

  // Collision check (FR-007).
  if (existsSync(schemaTarget)) {
    throw new PromoteError(
      `promote: a primitive already exists at ${schemaTarget}. ` +
        `Resolve the collision before promoting.`,
      7,
    );
  }
  if (existsSync(templateTarget)) {
    throw new PromoteError(
      `promote: a template already exists at ${templateTarget}. ` +
        `Resolve the collision before promoting.`,
      7,
    );
  }

  // Quality precondition (004 FR-007 / T018) — the SHARED gate, so it applies to
  // both grammar-authored and ingested drafts. A draft failing a blocking check
  // (30-line / total-functional / metadata) is refused unless `force`, which
  // promotes anyway and records the overridden findings. Runs AFTER the
  // collision check (a collision is a hard refusal `force` does not override).
  const quality = gradeDraft({ stagingDir: ingestedDir, draftName: options.draftName });
  let qualityOverride: string[] | undefined;
  if (!quality.ok) {
    if (!options.force) {
      throw new PromoteError(
        `promote: ${options.draftName} fails the quality gate (${quality.failing.join(", ")}). ` +
          `Fix the draft and re-run, or pass --force to override (the findings are recorded).`,
        8,
      );
    }
    qualityOverride = quality.failing;
  }

  // Ensure target dirs and move atomically (rename is atomic on the same fs).
  mkdirSync(dirname(schemaTarget), { recursive: true });
  mkdirSync(dirname(templateTarget), { recursive: true });
  renameSync(schemaDraftPath, schemaTarget);
  renameSync(join(ingestedDir, templateDraftName), templateTarget);

  return {
    ok: true,
    schemaTarget,
    templateTarget,
    elapsedMs: Date.now() - start,
    ...(qualityOverride ? { qualityOverride } : {}),
  };
}
