// Pre-promote quality report (T017, 004 US2 / FR-006/FR-007/FR-008).
//
// Grades a STAGED draft (`<name>.draft.ts` + `<name>.draft.<lang>.hbs`) against
// the per-primitive, mechanically-checkable constitution principles:
//
//   - V    30-line discipline        → template ≤ 30 lines             (BLOCKING)
//   - VIII total-functional          → primitive name/shape is not     (BLOCKING)
//                                       control-flow
//   - X    catalog-is-the-API        → metadata is complete: real      (BLOCKING)
//                                       intent + whenNotToUse + ≥1 example
//          schema ↔ template coherence → every field is rendered       (warn)
//          bijection round-trip        → full JSON→code→JSON in CI      (info)
//
// FR-008 deliberately scopes the MECHANICAL gate to V / VIII / X. The
// architectural principles (I/II/IV) are upheld by human review at the `promote`
// gate, not by an automated check. `ok` is false iff any BLOCKING check fails;
// `promote` refuses a draft with `ok === false` unless `--force` (T018).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type QualitySeverity = "error" | "warn" | "info";

export interface QualityCheck {
  /** Stable id: "30-line" | "total-functional" | "metadata" | "coherence" | "bijection". */
  id: string;
  severity: QualitySeverity;
  pass: boolean;
  message: string;
}

export interface QualityReport {
  /** False iff any error-severity (blocking) check fails. */
  ok: boolean;
  draftName: string;
  checks: QualityCheck[];
  /** ids of the failing BLOCKING checks (empty when ok). */
  failing: string[];
}

export class GrammarQualityError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "GrammarQualityError";
    this.exitCode = exitCode;
  }
}

const MAX_TEMPLATE_LINES = 30;

// Control-flow keywords a primitive must never be named after (constitution VIII;
// mirrors `composer doctor`'s naming-hygiene set, plus declarative-iteration traps).
const CONTROL_FLOW_NAMES = new Set([
  "while", "if", "else", "for", "switch", "case", "do",
  "async", "await", "yield", "fork", "spawn", "throw", "try", "catch",
  "when", "cond", "loop", "goto",
]);

interface DraftFiles {
  schemaSource: string;
  templateSource: string;
  templateLang: string;
}

/** Locate + read a staged draft's schema + template. */
function readDraft(stagingDir: string, draftName: string): DraftFiles {
  const schemaPath = join(stagingDir, `${draftName}.draft.ts`);
  if (!existsSync(schemaPath)) {
    throw new GrammarQualityError(
      `grammar check: schema draft not found: ${schemaPath}`,
      6,
    );
  }
  const tplPrefix = `${draftName}.draft.`;
  const entries = existsSync(stagingDir)
    ? readdirSync(stagingDir).filter(
        (f) =>
          f.startsWith(tplPrefix) &&
          f.endsWith(".hbs") &&
          f !== `${draftName}.draft.ts`,
      )
    : [];
  if (entries.length === 0) {
    throw new GrammarQualityError(
      `grammar check: template draft not found for ${draftName} in ${stagingDir}`,
      6,
    );
  }
  const templateFile = entries[0]!;
  return {
    schemaSource: readFileSync(schemaPath, "utf8"),
    templateSource: readFileSync(join(stagingDir, templateFile), "utf8"),
    templateLang: templateFile.slice(tplPrefix.length, -".hbs".length),
  };
}

/** Count template body lines (ignoring a single trailing newline). */
function templateLineCount(template: string): number {
  return template.replace(/\n$/, "").split(/\r?\n/).length;
}

/** Extract the primitive literal name from the schema (`z.literal("Name")`). */
function primitiveLiteral(schemaSource: string): string | null {
  const m = schemaSource.match(/primitive:\s*z\.literal\(\s*["']([^"']+)["']\s*\)/);
  return m ? m[1]! : null;
}

/** Extract declared schema field names (excluding the `primitive`/`id` discriminators). */
function schemaFields(schemaSource: string): string[] {
  const fields: string[] = [];
  const re = /^\s*([A-Za-z_]\w*)\s*:\s*z\./gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schemaSource)) !== null) {
    const name = m[1]!;
    if (name !== "primitive" && name !== "id") fields.push(name);
  }
  return fields;
}

/**
 * Grade a staged draft. Pure with respect to inputs aside from reading the two
 * draft files; no module loading (keeps the `promote` hot path light + safe).
 */
export function gradeDraft(opts: {
  stagingDir: string;
  draftName: string;
}): QualityReport {
  const { schemaSource, templateSource } = readDraft(opts.stagingDir, opts.draftName);
  const checks: QualityCheck[] = [];

  // V — 30-line discipline (BLOCKING).
  const lines = templateLineCount(templateSource);
  checks.push({
    id: "30-line",
    severity: "error",
    pass: lines <= MAX_TEMPLATE_LINES,
    message:
      lines <= MAX_TEMPLATE_LINES
        ? `template is ${lines} line(s) (≤ ${MAX_TEMPLATE_LINES})`
        : `template is ${lines} line(s) (> ${MAX_TEMPLATE_LINES}) — decompose into smaller primitives`,
  });

  // VIII — total-functional / no control-flow primitive (BLOCKING).
  const litName = primitiveLiteral(schemaSource) ?? opts.draftName;
  const isControlFlow = CONTROL_FLOW_NAMES.has(litName.toLowerCase());
  checks.push({
    id: "total-functional",
    severity: "error",
    pass: !isControlFlow,
    message: isControlFlow
      ? `primitive "${litName}" is a control-flow name (constitution VIII) — encode iteration declaratively (e.g. a fixed forEach primitive)`
      : `primitive "${litName}" is declarative (no control-flow name)`,
  });

  // X — metadata is the API: real intent + whenNotToUse + ≥1 example (BLOCKING).
  const metaIssues = metadataGaps(schemaSource);
  checks.push({
    id: "metadata",
    severity: "error",
    pass: metaIssues.length === 0,
    message:
      metaIssues.length === 0
        ? "metadata complete: intent, whenNotToUse, and ≥1 example present"
        : `metadata incomplete: ${metaIssues.join("; ")}`,
  });

  // schema ↔ template coherence (warn — heuristic).
  const fields = schemaFields(schemaSource);
  const unrendered = fields.filter((f) => !referencesField(templateSource, f));
  checks.push({
    id: "coherence",
    severity: "warn",
    pass: unrendered.length === 0,
    message:
      unrendered.length === 0
        ? "every schema field is referenced by the template"
        : `schema field(s) not referenced in the template: ${unrendered.join(", ")}`,
  });

  // bijection round-trip (info — the full JSON→code→JSON check runs in CI).
  checks.push({
    id: "bijection",
    severity: "info",
    pass: true,
    message:
      "bijection round-trip is enforced in CI (tests/contract/*bijection*); not re-run inline",
  });

  const failing = checks.filter((c) => c.severity === "error" && !c.pass).map((c) => c.id);
  return { ok: failing.length === 0, draftName: opts.draftName, checks, failing };
}

/** Return human-readable metadata gaps (empty array = complete). */
function metadataGaps(schemaSource: string): string[] {
  const gaps: string[] = [];

  // intent: present and not a TODO placeholder.
  const intent = schemaSource.match(/intent:\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/);
  if (!intent || /todo/i.test(intent[1]!)) gaps.push("intent is missing or a TODO placeholder");

  // whenNotToUse: an array with ≥1 real (non-TODO) entry.
  const wnt = schemaSource.match(/whenNotToUse:\s*\[([\s\S]*?)\]/);
  if (!wnt) {
    gaps.push("whenNotToUse is missing");
  } else {
    const body = wnt[1]!;
    const entries = body.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g) ?? [];
    const real = entries.filter((e) => !/todo/i.test(e));
    if (real.length === 0) gaps.push("whenNotToUse has no real entry (only TODO/empty)");
  }

  // examples: a non-empty array.
  const ex = schemaSource.match(/examples:\s*\[([\s\S]*?)\]/);
  if (!ex) {
    gaps.push("examples is missing");
  } else if (ex[1]!.trim() === "") {
    gaps.push("examples is empty (need ≥1)");
  }

  return gaps;
}

/** Does the template reference a field by name (mustache, each-block, or attribute)? */
function referencesField(template: string, field: string): boolean {
  // Match {{field}}, {{{json field}}}, {{#each field}}, field={{...}}, etc.
  const re = new RegExp(`(\\{\\{[^}]*\\b${escapeRegExp(field)}\\b)|(\\b${escapeRegExp(field)}\\s*=)`);
  return re.test(template);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Format a report for human/CLI output. */
export function formatQualityReport(report: QualityReport): string {
  const head = report.ok
    ? `grammar check: ${report.draftName} — PASS`
    : `grammar check: ${report.draftName} — FAIL (${report.failing.join(", ")})`;
  const lines = [head, ""];
  for (const c of report.checks) {
    const tag = c.pass ? "✓" : c.severity === "error" ? "✗" : c.severity === "warn" ? "!" : "·";
    lines.push(`  ${tag} [${c.id}] ${c.message}`);
  }
  return lines.join("\n") + "\n";
}
