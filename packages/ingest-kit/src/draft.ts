// Writes a CandidateDraft to the quarantine directory.
// Files emitted: `<name>.draft.ts` (schema) and `<name>.draft.<lang>.hbs`
// (template). The `.draft.` infix is the on-disk marker the engine and
// `composer promote` use to recognise a not-yet-activated primitive.

import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import type { CandidateDraft } from "./types.js";

// Strict allow-lists for the user-controlled path segments. Drafts come from
// ingester plugins, but the names are *derived* from source-file contents
// (e.g., a React component name) and must never be allowed to escape the
// quarantine directory via `..` segments or absolute paths.
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const LANG_PATTERN = /^[a-z][a-z0-9]{0,15}(?:\.[a-z][a-z0-9]{0,15}){0,2}$/;

export interface WrittenDraft {
  /** Absolute path to the schema draft file (`<name>.draft.ts`). */
  schemaPath: string;
  /** Absolute path to the template draft file (`<name>.draft.<lang>.hbs`). */
  templatePath: string;
}

/**
 * Write a draft to the engine-ignored quarantine dir. Creates the dir if it
 * doesn't exist. Overwrites any prior draft of the same name (drafts are
 * cheap to regenerate; promotion is the gate).
 */
export function writeDraft(draft: CandidateDraft, quarantineDir: string): WrittenDraft {
  // Validate the user-controlled path segments BEFORE building any path. The
  // name comes from ingested source (e.g., a component name); the language is
  // a template-suffix the plugin reports. Neither may contain `..`, separators,
  // or shell metacharacters.
  if (!NAME_PATTERN.test(draft.name)) {
    throw new Error(`writeDraft: invalid draft name ${JSON.stringify(draft.name)}`);
  }
  if (!LANG_PATTERN.test(draft.templateLanguage)) {
    throw new Error(
      `writeDraft: invalid templateLanguage ${JSON.stringify(draft.templateLanguage)}`,
    );
  }

  if (!existsSync(quarantineDir)) {
    mkdirSync(quarantineDir, { recursive: true });
  }

  const quarantineAbs = resolve(quarantineDir);
  const schemaPath = resolve(quarantineAbs, `${draft.name}.draft.ts`);
  const templatePath = resolve(
    quarantineAbs,
    `${draft.name}.draft.${draft.templateLanguage}.hbs`,
  );

  // Confirm both resolved paths stay strictly inside the quarantine.
  for (const p of [schemaPath, templatePath]) {
    const rel = relative(quarantineAbs, p);
    if (rel === "" || rel.startsWith("..") || rel.includes(`..${"/"}`)) {
      throw new Error(`writeDraft: path escapes quarantine: ${p}`);
    }
    // Refuse to follow a pre-existing symlink at the target — drafts are
    // regular files only. (Honest re-ingest overwrites a prior regular file;
    // a symlink there is suspicious.)
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) {
      throw new Error(`writeDraft: target is a symlink, refusing: ${p}`);
    }
  }

  writeFileSync(schemaPath, draft.schemaSource, "utf8");
  writeFileSync(templatePath, draft.templateSource, "utf8");
  return { schemaPath, templatePath };
}
