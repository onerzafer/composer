// `composer grammar <phase>` — the deterministic CLI side of grammar-kit
// (T006/T017, 004). The adaptive phases (specify/clarify/plan/tasks/author/
// checklist) are AI skills run in the developer's agent; the CLI provides the
// reproducible helpers: the pre-promote quality report and path resolution.
//
// Activation is NOT here — a draft enters the catalog only via `composer promote`
// (the shared 003 gate, FR-004). No tool is added to the MCP/agent surface (FR-005).

import {
  gradeDraft,
  resolveStagingDir,
  formatQualityReport,
  GrammarStageError,
  GrammarQualityError,
  type QualityReport,
} from "@composer/grammar-kit";

export class GrammarCliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "GrammarCliError";
    this.exitCode = exitCode;
  }
}

// The adaptive phases live as AI skills; the CLI points the human at them.
const SKILL_PHASES: Record<string, string> = {
  specify: "grammar.specify — NL intent → vocabulary brief",
  clarify: "grammar.clarify — recommend-first ≤5-question interview over the brief",
  plan: "grammar.plan — brief → catalog design",
  tasks: "grammar.tasks — design → per-primitive authoring task list",
  author: "grammar.author — draft Zod schema + template + metadata into staging",
  checklist: "grammar.checklist — wraps `composer grammar check` as an advisory report",
};

export interface GrammarCheckOptions {
  projectRoot: string;
  draftName: string;
}

/** Run the pre-promote quality report against a staged draft. */
export function grammarCheck(options: GrammarCheckOptions): QualityReport {
  let stagingDir: string;
  try {
    stagingDir = resolveStagingDir(options.projectRoot);
  } catch (err) {
    if (err instanceof GrammarStageError) throw new GrammarCliError(err.message, err.exitCode);
    throw err;
  }
  try {
    return gradeDraft({ stagingDir, draftName: options.draftName });
  } catch (err) {
    if (err instanceof GrammarQualityError) throw new GrammarCliError(err.message, err.exitCode);
    throw err;
  }
}

export interface GrammarPaths {
  stagingDir: string;
}

/** Resolve the deterministic paths the skills need (staging dir, etc.). */
export function grammarPaths(projectRoot: string): GrammarPaths {
  try {
    return { stagingDir: resolveStagingDir(projectRoot) };
  } catch (err) {
    if (err instanceof GrammarStageError) throw new GrammarCliError(err.message, err.exitCode);
    throw err;
  }
}

export interface GrammarRouteResult {
  /** "check" | "paths" | "skill" */
  kind: "check" | "paths" | "skill";
  report?: QualityReport;
  paths?: GrammarPaths;
  message?: string;
}

/**
 * Route `composer grammar <phase> [arg]`:
 *   - `check <draft>` → quality report
 *   - `paths`         → resolved deterministic paths
 *   - any AI phase    → a pointer to the corresponding skill (no activation here)
 */
export function runGrammar(options: {
  projectRoot: string;
  phase: string;
  arg?: string;
}): GrammarRouteResult {
  const { phase } = options;
  if (phase === "check") {
    if (!options.arg) {
      throw new GrammarCliError("grammar check: a <draft> name is required", 2);
    }
    return { kind: "check", report: grammarCheck({ projectRoot: options.projectRoot, draftName: options.arg }) };
  }
  if (phase === "paths") {
    return { kind: "paths", paths: grammarPaths(options.projectRoot) };
  }
  if (phase in SKILL_PHASES) {
    return {
      kind: "skill",
      message:
        `grammar ${phase} is an authoring-time AI skill — run the \`${SKILL_PHASES[phase]}\`\n` +
        `skill in your coding agent. The CLI handles the deterministic steps:\n` +
        `  composer grammar check <draft>   (quality report)\n` +
        `  composer promote <draft>         (the human gate — activates the draft)`,
    };
  }
  throw new GrammarCliError(
    `grammar: unknown phase "${phase}". Expected one of: check, paths, ${Object.keys(SKILL_PHASES).join(", ")}.`,
    2,
  );
}

export { formatQualityReport };
