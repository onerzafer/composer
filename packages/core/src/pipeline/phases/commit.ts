// T038 — Pipeline phase: atomic commit.
//
// Writes the spec file, all rendered files, the updated source map, and the
// updated output-hash record. v0.1 simplification: direct writes to target
// paths (no staging-dir + rename pass). Drift-check has already validated
// existing-file safety; rollback semantics live at the orchestrator level
// (any error throws → orchestrator's finally releases the lock; partial
// writes here are bounded by the order below).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { hashContent } from "../../drift/hasher.js";
import {
  addFileEntries,
  clearFileEntries,
  loadSourceMap,
  saveSourceMap,
} from "../../sourcemap/persist.js";
import type { RenderedFile } from "./render.js";

export interface CommitInput {
  projectRoot: string;
  workspaceRoot: string;
  specId: string;
  specJson: unknown;
  specRelPath: string;
  rendered: RenderedFile[];
  previousHashes: Record<string, string>;
}

export interface CommittedFile {
  path: string;
  kind: "created" | "updated";
  hash: string;
}

export interface CommitResult {
  /** Project-relative path of the saved spec. */
  spec_saved: string;
  files_written: CommittedFile[];
  hashes: Record<string, string>;
}

export function commit(input: CommitInput): CommitResult {
  // 1. Persist the spec
  const specAbsPath = join(input.workspaceRoot, "specs", `${input.specId}.json`);
  mkdirSync(dirname(specAbsPath), { recursive: true });
  writeFileSync(specAbsPath, JSON.stringify(input.specJson, null, 2) + "\n", "utf8");

  // 2. Write all rendered files; track new hashes
  const filesWritten: CommittedFile[] = [];
  const newHashes: Record<string, string> = { ...input.previousHashes };
  for (const file of input.rendered) {
    const absPath = join(input.projectRoot, file.path);
    const existed = existsSync(absPath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, file.content, "utf8");
    const hash = hashContent(file.content);
    newHashes[file.path] = hash;
    filesWritten.push({
      path: file.path,
      kind: existed ? "updated" : "created",
      hash,
    });
  }

  // 3. Source map — clear stale entries for these files, then add new ones
  const sourceMap = loadSourceMap(input.workspaceRoot);
  for (const file of input.rendered) {
    clearFileEntries(sourceMap, file.path);
    addFileEntries(sourceMap, file.path, file.sourceMap);
  }
  saveSourceMap(input.workspaceRoot, sourceMap);

  // 4. Persist hash record
  const hashesPath = join(
    input.workspaceRoot,
    ".composer",
    "cache",
    "output.hashes.json",
  );
  mkdirSync(dirname(hashesPath), { recursive: true });
  writeFileSync(
    hashesPath,
    JSON.stringify(
      {
        version: 1,
        hashes: newHashes,
        lastComposeAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    spec_saved: relative(input.projectRoot, specAbsPath),
    files_written: filesWritten,
    hashes: newHashes,
  };
}
