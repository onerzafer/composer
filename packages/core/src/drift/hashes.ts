// T084 — Output hash store API (data-model §10).
//
// The compose pipeline writes `<workspace>/.composer/cache/output.hashes.json`
// after every successful commit. This module is the canonical reader/writer so
// other surfaces (the drift phase, `composer doctor`, future migrations) don't
// re-parse the file format inline.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface OutputHashStore {
  version: 1;
  hashes: Record<string, string>;
  lastComposeAt: string | null;
}

export function hashStorePath(workspaceRoot: string): string {
  return join(workspaceRoot, ".composer", "cache", "output.hashes.json");
}

export function emptyHashStore(): OutputHashStore {
  return { version: 1, hashes: {}, lastComposeAt: null };
}

export function loadHashStore(workspaceRoot: string): OutputHashStore {
  const path = hashStorePath(workspaceRoot);
  if (!existsSync(path)) return emptyHashStore();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<OutputHashStore>;
    if (parsed.version !== 1) return emptyHashStore();
    return {
      version: 1,
      hashes: parsed.hashes ?? {},
      lastComposeAt: parsed.lastComposeAt ?? null,
    };
  } catch {
    return emptyHashStore();
  }
}

export function saveHashStore(workspaceRoot: string, store: OutputHashStore): void {
  const path = hashStorePath(workspaceRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), "utf8");
}

/** Merge a fresh batch of (path → hash) into the store and persist. */
export function recordCompose(
  workspaceRoot: string,
  freshHashes: Record<string, string>,
): OutputHashStore {
  const store = loadHashStore(workspaceRoot);
  store.hashes = { ...store.hashes, ...freshHashes };
  store.lastComposeAt = new Date().toISOString();
  saveHashStore(workspaceRoot, store);
  return store;
}
