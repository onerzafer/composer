// Public API of @composer/grammar-kit — the deterministic helpers behind the
// guided authoring workflow. (The AI skills + templates + taxonomy ship as
// package assets under skills/ templates/ taxonomy/; they are not code.)

export { stageDraft, resolveStagingDir, GrammarStageError } from "./stage.js";
export type { StageOptions, StageResult } from "./stage.js";

export { gradeDraft, formatQualityReport, GrammarQualityError } from "./quality.js";
export type {
  QualityReport,
  QualityCheck,
  QualitySeverity,
} from "./quality.js";

export const GRAMMAR_KIT_VERSION = "0.1.0-alpha.0";
