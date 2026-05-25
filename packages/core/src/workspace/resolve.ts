// T023 — Workspace resolver: find composer.json by walking up from cwd,
// parse + validate it, and locate the workspace folder it points to.

import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { readComposerJson, ComposerConfigError, type ComposerConfig } from "./validate-config.js";

export interface ResolvedWorkspace {
  /** Project root — directory containing composer.json. */
  projectRoot: string;
  /** Absolute workspace folder (composer.json's `workspace` resolved). */
  workspaceRoot: string;
  /** Parsed and validated config. */
  config: ComposerConfig;
}

/**
 * Walk upward from `cwd` looking for the nearest composer.json. Returns the
 * resolved workspace + parsed config. Throws if no composer.json is found
 * before the filesystem root.
 *
 * Used by every CLI command and the MCP server on startup.
 */
export function resolveWorkspace(cwd: string): ResolvedWorkspace {
  let dir = resolve(cwd);
  // Defensive cap on walk depth; should never matter on real filesystems.
  for (let i = 0; i < 64; i++) {
    const candidate = join(dir, "composer.json");
    if (existsSync(candidate)) {
      const config = readComposerJson(dir);
      const workspaceRoot = resolve(dir, config.workspace);
      if (!existsSync(workspaceRoot)) {
        throw new ComposerConfigError(
          `composer.json points workspace to "${config.workspace}" but the directory does not exist (${workspaceRoot})`,
        );
      }
      if (!statSync(workspaceRoot).isDirectory()) {
        throw new ComposerConfigError(
          `composer.json workspace path "${config.workspace}" is not a directory (${workspaceRoot})`,
        );
      }
      return { projectRoot: dir, workspaceRoot, config };
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      throw new ComposerConfigError(
        `No composer.json found walking up from "${cwd}". Run \`composer init\` to create one.`,
      );
    }
    dir = parent;
  }
  throw new ComposerConfigError(`Aborted composer.json search after 64 directory levels`);
}
