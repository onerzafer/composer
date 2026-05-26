// T088 — `composer trace <spec_id>:<line>` (US5 #2, FR-020).
//
// Spec → code source-map traversal. Returns every output span originating
// from a given spec line.

import { loadSourceMap, resolveWorkspace, traceFrom } from "@composer/core";

export class TraceError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "TraceError";
  }
}

export interface TraceOptions {
  projectRoot: string;
  target: string; // "<spec_id>:<line>"
}

export interface TraceResult {
  spec_id: string;
  spec_line: number;
  spans: { file: string; line_start: number; line_end: number }[];
}

export function trace(options: TraceOptions): TraceResult {
  const { specId, line } = parseTarget(options.target);
  const ws = resolveWorkspace(options.projectRoot);
  const sm = loadSourceMap(ws.workspaceRoot);

  // First check the spec is known at all (any line). Distinguishes "no spec"
  // from "line not associated" per cli-commands.md exit codes.
  const knownSpec = Object.keys(sm.by_spec).some((k) => k.startsWith(`${specId}:`));
  if (!knownSpec) {
    throw new TraceError(`Spec "${specId}" not found in source map.`, 1);
  }

  const spans = traceFrom(sm, specId, line);
  if (spans.length === 0) {
    throw new TraceError(
      `Spec "${specId}" line ${line} is not associated with any output span. ` +
        `Tracked lines: ${listTrackedLines(sm, specId).join(", ")}`,
      2,
    );
  }

  return { spec_id: specId, spec_line: line, spans };
}

function parseTarget(target: string): { specId: string; line: number } {
  const lastColon = target.lastIndexOf(":");
  if (lastColon <= 0 || lastColon === target.length - 1) {
    throw new TraceError(
      `Invalid target "${target}"; expected "<spec_id>:<line>" (e.g. "pricing:12")`,
      1,
    );
  }
  const specId = target.slice(0, lastColon);
  const line = Number(target.slice(lastColon + 1));
  if (!Number.isInteger(line) || line < 1) {
    throw new TraceError(`Invalid line number; must be a positive integer`, 1);
  }
  return { specId, line };
}

function listTrackedLines(
  sm: import("@composer/core").SourceMap,
  specId: string,
): number[] {
  return Object.keys(sm.by_spec)
    .filter((k) => k.startsWith(`${specId}:`))
    .map((k) => Number(k.split(":")[1]))
    .sort((a, b) => a - b);
}

export function formatTraceHuman(r: TraceResult): string {
  const header = `${r.spec_id}.json:${r.spec_line}\n`;
  const body = r.spans
    .map((s) => `  → ${s.file}:${s.line_start}-${s.line_end}`)
    .join("\n");
  return header + body + "\n";
}
