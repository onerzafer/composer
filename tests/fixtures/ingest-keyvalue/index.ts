// Minimal non-TypeScript ingester (003 US3 / T016), authored entirely against
// the public @composer/ingest-kit SDK — zero engine or kit changes (SC-005).
//
// It reads a flat `.env`-style source through the format-native `keyvalueBackend`
// (NOT the TypeScript compiler), demonstrating that the parse layer is genuinely
// pluggable. It is the *inverse codec* of tests/fixtures/custom-adapter-keyvalue's
// `Config` primitive, so the two pair up for the bijection round-trip
// (FR-009 / SC-003 — see tests/contract/ingest-bijection.test.ts).

import { basename } from "node:path";
import {
  defineIngester,
  keyvalueBackend,
  type CandidateDraft,
  type KeyValueParsedSource,
  type ParsedSource,
} from "@composer/ingest-kit";

/** A `Config` spec instance — the shape the keyvalue adapter composes. */
export interface ConfigNode {
  primitive: "Config";
  id: string;
  name: string;
  values: { key: string; value: string }[];
}

/** Config name = the source basename without its `.env` extension. */
function configName(parsedPath: string): string {
  return basename(parsedPath).replace(/\.env$/, "");
}

export const keyvalueIngester = defineIngester<KeyValueParsedSource, ConfigNode>({
  name: "keyvalue",
  backend: keyvalueBackend,

  // Schema-derivation: emit a `Config` primitive draft. (Mirrors the live
  // keyvalue adapter's Config schema; a real author would refine the metadata
  // before `promote`.)
  extract(parsed): CandidateDraft[] {
    const draft: CandidateDraft = {
      name: "Config",
      source: parsed.path,
      schemaSource: [
        `import { z } from "zod";`,
        ``,
        `export const Config = z`,
        `  .object({`,
        `    primitive: z.literal("Config"),`,
        `    id: z.string(),`,
        `    name: z.string().min(1),`,
        `    values: z.array(z.object({ key: z.string(), value: z.string() })).min(1),`,
        `  })`,
        `  .strict();`,
        ``,
      ].join("\n"),
      templateSource: [
        `# from: spec={{spec_path}} primitive=Config id={{id}}`,
        `{{#each values}}{{key}}={{value}}`,
        `{{/each}}`,
        ``,
      ].join("\n"),
      templateLanguage: "env",
      meta: {
        primitive: "Config",
        version: "0.1.0",
        intent: "TODO: describe this configuration file.",
        whenToUse: "TODO",
        whenNotToUse: ["TODO"],
        fieldGuidance: {},
        examples: [],
      },
    };
    return [draft];
  },

  // Instance-recovery: the exact inverse of the keyvalue adapter's template,
  // so ingest → compose → re-ingest round-trips the JSON.
  decode(parsed: ParsedSource<KeyValueParsedSource>): ConfigNode[] {
    const name = configName(parsed.path);
    return [
      {
        primitive: "Config",
        id: name,
        name,
        values: parsed.tree.pairs.map((p) => ({ key: p.key, value: p.value })),
      },
    ];
  },
});

export default keyvalueIngester;
