// T087 — `composer explain <file>:<line>` (US5 #1, FR-020, SC-005).
//
// Code → spec source-map traversal. Looks up the FileEntry covering
// (file, line) in the workspace's persisted source map.

import { explainAt, loadSourceMap, resolveWorkspace } from "@composer/core";

export class ExplainError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "ExplainError";
  }
}

export interface ExplainOptions {
  projectRoot: string;
  target: string; // "<file>:<line>"
}

export interface ExplainResult {
  file: string;
  line: number;
  spec_id: string;
  spec_line: number;
  primitive: string;
  node_id: string;
}

export function explain(options: ExplainOptions): ExplainResult {
  const { file, line } = parseTarget(options.target);
  const ws = resolveWorkspace(options.projectRoot);
  const sm = loadSourceMap(ws.workspaceRoot);
  const entry = explainAt(sm, file, line);
  if (!entry) {
    // Distinguish "file not tracked" vs "line out of bounds" by checking
    // whether any entries exist for this file.
    const hasFile = Boolean(sm.by_file[file]);
    if (!hasFile) {
      throw new ExplainError(
        `No source map entries for "${file}". Either the file isn't generated, ` +
          `or no compose has run yet.`,
        1,
      );
    }
    throw new ExplainError(
      `Line ${line} is not covered by any span in ${file}. ` +
        `Tracked spans: ${(sm.by_file[file] ?? []).map((e) => `${e.line_start}-${e.line_end}`).join(", ")}`,
      2,
    );
  }
  return {
    file,
    line,
    spec_id: entry.spec_id,
    spec_line: entry.spec_line,
    primitive: entry.primitive,
    node_id: entry.node_id,
  };
}

function parseTarget(target: string): { file: string; line: number } {
  const lastColon = target.lastIndexOf(":");
  if (lastColon <= 0 || lastColon === target.length - 1) {
    throw new ExplainError(
      `Invalid target "${target}"; expected "<file>:<line>" (e.g. "src/app/page.tsx:42")`,
      1,
    );
  }
  const file = target.slice(0, lastColon);
  const lineStr = target.slice(lastColon + 1);
  const line = Number(lineStr);
  if (!Number.isInteger(line) || line < 1) {
    throw new ExplainError(`Invalid line number "${lineStr}"; must be a positive integer`, 1);
  }
  return { file, line };
}

export function formatExplainHuman(r: ExplainResult): string {
  return (
    `${r.file}:${r.line}\n` +
    `  spec:      ${r.spec_id}.json:${r.spec_line}\n` +
    `  primitive: ${r.primitive}\n` +
    `  node_id:   ${r.node_id}\n`
  );
}
