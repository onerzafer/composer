// T016 — Path traversal protection (research R10).

import { resolve, relative, sep } from "node:path";

/**
 * Ensure a target path resolves *inside* the given project root.
 * Throws if the resolved absolute path escapes upward via `..` or absolute path.
 *
 * Called once per output.map entry at workspace-resolution time (pipeline step 1d).
 */
export function assertWithinProject(projectRoot: string, target: string): void {
  const absRoot = resolve(projectRoot);
  const absTarget = resolve(absRoot, target);
  const rel = relative(absRoot, absTarget);
  if (rel.startsWith(".." + sep) || rel === ".." || rel.startsWith(sep)) {
    throw new Error(
      `Path traversal detected: "${target}" resolves outside project root "${absRoot}"`,
    );
  }
}
