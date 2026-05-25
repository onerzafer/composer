// T018 — SHA-256 file hasher with LF normalization (research R11).
//
// Used by drift detection (FR-015): before any overwrite, the engine hashes
// the existing file and compares against the previous-generation hash record.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/**
 * Hash a file's UTF-8 content with line endings normalized to LF.
 * Returns null if the file does not exist.
 */
export function hashFile(absPath: string): string | null {
  if (!existsSync(absPath)) return null;
  const content = readFileSync(absPath, "utf8");
  return hashContent(content);
}

/** Hash arbitrary string content with LF normalization. */
export function hashContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
