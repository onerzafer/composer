// Writes a CandidateDraft to the quarantine directory.
// Files emitted: `<name>.draft.ts` (schema) and `<name>.draft.<lang>.hbs`
// (template). The `.draft.` infix is the on-disk marker the engine and
// `composer promote` use to recognise a not-yet-activated primitive.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CandidateDraft } from "./types.js";

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
  if (!existsSync(quarantineDir)) {
    mkdirSync(quarantineDir, { recursive: true });
  }
  const schemaPath = join(quarantineDir, `${draft.name}.draft.ts`);
  const templatePath = join(
    quarantineDir,
    `${draft.name}.draft.${draft.templateLanguage}.hbs`,
  );
  writeFileSync(schemaPath, draft.schemaSource, "utf8");
  writeFileSync(templatePath, draft.templateSource, "utf8");
  return { schemaPath, templatePath };
}
