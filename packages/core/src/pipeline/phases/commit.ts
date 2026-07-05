// T038 — Pipeline phase: atomic commit.
//
// v0.2 hardening (docs/v0.2-deferrals.md #3): staging-dir + atomic-rename.
//
// Pass 1 renders every commit artifact — the spec json, every rendered file,
// the updated source map, and the updated output-hash record — into
// `.composer/staging/` under the workspace root. No target path is touched
// during this pass. If anything throws here (bad path, disk full, EEXIST-style
// collisions between two staged files, …), the partial staging tree is wiped
// and the error propagates — the target tree is byte-identical to pre-compose.
//
// Pass 2 atomic-renames each staged artifact into its target path. A single
// `rename(2)` is atomic on POSIX for paths on the same filesystem, so no
// single target file can ever be observed half-written. There is, however,
// no filesystem transaction spanning *multiple* renames: if pass 2 throws
// partway through a multi-file compose, the artifacts already renamed stay
// committed (rolling them back is not attempted — see deferral #3's
// "impossible to roll back" note) while the rest never reach the target.
// That partial-commit state is surfaced explicitly via `CommitRenameError`
// (which artifacts landed, which didn't) rather than swallowed.
//
// The staging directory is cleared at the start of every commit (a stale
// leftover from a previous crash was, by construction, never renamed into
// place — discarding it is always safe) and best-effort cleaned up again
// once pass 2 finishes, whichever way it finishes.

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { hashContent } from "../../drift/hasher.js";
import {
  addFileEntries,
  clearFileEntries,
  loadSourceMap,
  sourceMapPath,
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

/** One staged artifact awaiting its atomic rename into place. */
interface StagedArtifact {
  /** Absolute path inside `.composer/staging/` holding the fully-written content. */
  stagedPath: string;
  /** Final absolute target path this artifact renames into. */
  targetPath: string;
  /** Human-readable label for error reporting (e.g. "spec", "file:src/x.ts"). */
  label: string;
}

/**
 * Thrown when pass 2 (renaming staged artifacts into place) fails partway
 * through a multi-artifact commit. `renamed` lists the target paths that are
 * already committed and will NOT be rolled back; `notRenamed` lists targets
 * that never received the update (their pre-compose content, or absence, is
 * unchanged). See module comment for why a full rollback isn't attempted.
 */
export class CommitRenameError extends Error {
  readonly code = "COMMIT_RENAME_FAILED" as const;
  public override readonly cause: unknown;
  constructor(
    public readonly renamed: string[],
    public readonly notRenamed: string[],
    cause: unknown,
  ) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(
      `COMMIT_RENAME_FAILED: ${renamed.length} artifact(s) committed, ` +
        `${notRenamed.length} not committed before failure: ${causeMessage}`,
    );
    this.name = "CommitRenameError";
    this.cause = cause;
  }
}

export function commit(input: CommitInput): CommitResult {
  const stagingRoot = join(input.workspaceRoot, ".composer", "staging");

  // A leftover staging tree from a prior crash was, by construction, never
  // renamed into a target (rename is the last step of a commit) — safe to
  // discard unconditionally before starting a fresh two-pass commit.
  rmSync(stagingRoot, { recursive: true, force: true });

  // ---- Compute every artifact's final content + target metadata up front.
  // Nothing here touches disk at the target; it's all in-memory bookkeeping. ----

  const specAbsPath = join(input.workspaceRoot, "specs", `${input.specId}.json`);
  const specContent = JSON.stringify(input.specJson, null, 2) + "\n";

  const filesWritten: CommittedFile[] = [];
  const newHashes: Record<string, string> = { ...input.previousHashes };
  const fileArtifacts: { path: string; absPath: string; content: string; kind: "created" | "updated"; hash: string }[] = [];
  for (const file of input.rendered) {
    const absPath = join(input.projectRoot, file.path);
    const existed = existsSync(absPath);
    const hash = hashContent(file.content);
    newHashes[file.path] = hash;
    fileArtifacts.push({ path: file.path, absPath, content: file.content, kind: existed ? "updated" : "created", hash });
  }

  const sourceMap = loadSourceMap(input.workspaceRoot);
  for (const file of input.rendered) {
    clearFileEntries(sourceMap, file.path);
    addFileEntries(sourceMap, file.path, file.sourceMap);
  }
  const sourceMapContent = JSON.stringify(sourceMap, null, 2);
  const sourceMapAbsPath = sourceMapPath(input.workspaceRoot);

  const hashesAbsPath = join(input.workspaceRoot, ".composer", "cache", "output.hashes.json");
  const hashesContent = JSON.stringify(
    {
      version: 1,
      hashes: newHashes,
      lastComposeAt: new Date().toISOString(),
    },
    null,
    2,
  );

  // ---- Pass 1: write every artifact to staging. Target paths are untouched. ----

  const staged: StagedArtifact[] = [];
  try {
    const specStaged = join(stagingRoot, "specs", `${input.specId}.json`);
    writeStagedFile(specStaged, specContent);
    staged.push({ stagedPath: specStaged, targetPath: specAbsPath, label: "spec" });

    for (const file of fileArtifacts) {
      const fileStaged = join(stagingRoot, "project", file.path);
      writeStagedFile(fileStaged, file.content);
      staged.push({ stagedPath: fileStaged, targetPath: file.absPath, label: `file:${file.path}` });
    }

    const sourceMapStaged = join(stagingRoot, "cache", "sourcemap.json");
    writeStagedFile(sourceMapStaged, sourceMapContent);
    staged.push({ stagedPath: sourceMapStaged, targetPath: sourceMapAbsPath, label: "sourcemap" });

    const hashesStaged = join(stagingRoot, "cache", "output.hashes.json");
    writeStagedFile(hashesStaged, hashesContent);
    staged.push({ stagedPath: hashesStaged, targetPath: hashesAbsPath, label: "hashes" });
  } catch (err) {
    // Nothing has been renamed into a target yet — wipe the partial staging
    // tree so no trace of the failed attempt lingers, then rethrow as-is.
    rmSync(stagingRoot, { recursive: true, force: true });
    throw err;
  }

  // ---- Pass 2: atomic-rename every staged artifact into place. ----

  const renamedTargets: string[] = [];
  try {
    for (const artifact of staged) {
      mkdirSync(dirname(artifact.targetPath), { recursive: true });
      renameSync(artifact.stagedPath, artifact.targetPath);
      renamedTargets.push(artifact.targetPath);
    }
  } catch (err) {
    const notRenamed = staged
      .map((a) => a.targetPath)
      .filter((t) => !renamedTargets.includes(t));
    throw new CommitRenameError(renamedTargets, notRenamed, err);
  } finally {
    // Every staged path is now either renamed away (gone) or orphaned
    // (never reached) — either way the staging tree itself is stale.
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  for (const file of fileArtifacts) {
    filesWritten.push({ path: file.path, kind: file.kind, hash: file.hash });
  }

  return {
    spec_saved: relative(input.projectRoot, specAbsPath),
    files_written: filesWritten,
    hashes: newHashes,
  };
}

function writeStagedFile(stagedPath: string, content: string): void {
  mkdirSync(dirname(stagedPath), { recursive: true });
  writeFileSync(stagedPath, content, "utf8");
}
