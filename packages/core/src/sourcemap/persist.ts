// T022 — Bi-directional source map persistence (data-model §9, research R12).
//
// Format: `.composer/cache/sourcemap.json` with two indices:
//   - by_file: <rel-output-path> -> FileEntry[]
//   - by_spec: "<spec_id>:<spec_line>" -> SpecEntry[]
//
// Powers `composer explain` (code→spec) and `composer trace` (spec→code).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface FileEntry {
  line_start: number;
  line_end: number;
  spec_id: string;
  spec_line: number;
  primitive: string;
  node_id: string;
}

export interface SpecEntry {
  file: string;
  line_start: number;
  line_end: number;
}

export interface SourceMap {
  version: 1;
  by_file: Record<string, FileEntry[]>;
  by_spec: Record<string, SpecEntry[]>;
}

export function emptySourceMap(): SourceMap {
  return { version: 1, by_file: {}, by_spec: {} };
}

export function sourceMapPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".composer", "cache", "sourcemap.json");
}

export function loadSourceMap(workspaceRoot: string): SourceMap {
  const path = sourceMapPath(workspaceRoot);
  if (!existsSync(path)) return emptySourceMap();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as SourceMap;
    if (parsed.version !== 1) return emptySourceMap();
    return parsed;
  } catch {
    return emptySourceMap();
  }
}

export function saveSourceMap(workspaceRoot: string, map: SourceMap): void {
  const path = sourceMapPath(workspaceRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(map, null, 2), "utf8");
}

/** Lookup the FileEntry covering `(file, line)`; null if none. */
export function explainAt(map: SourceMap, file: string, line: number): FileEntry | null {
  const entries = map.by_file[file];
  if (!entries) return null;
  for (const entry of entries) {
    if (line >= entry.line_start && line <= entry.line_end) return entry;
  }
  return null;
}

/** Lookup all output spans originating from `(spec_id, spec_line)`. */
export function traceFrom(map: SourceMap, specId: string, line: number): SpecEntry[] {
  return map.by_spec[`${specId}:${line}`] ?? [];
}

/** Add file-side entries; mirrors them in the by_spec index. */
export function addFileEntries(map: SourceMap, file: string, entries: FileEntry[]): void {
  map.by_file[file] = entries;
  for (const e of entries) {
    const key = `${e.spec_id}:${e.spec_line}`;
    const list = map.by_spec[key] ?? [];
    list.push({ file, line_start: e.line_start, line_end: e.line_end });
    map.by_spec[key] = list;
  }
}

/** Remove all entries associated with `file` from both indices. */
export function clearFileEntries(map: SourceMap, file: string): void {
  const entries = map.by_file[file] ?? [];
  delete map.by_file[file];
  for (const e of entries) {
    const key = `${e.spec_id}:${e.spec_line}`;
    const list = map.by_spec[key];
    if (!list) continue;
    const filtered = list.filter((s) => s.file !== file);
    if (filtered.length === 0) {
      delete map.by_spec[key];
    } else {
      map.by_spec[key] = filtered;
    }
  }
}
