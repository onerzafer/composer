// Format-native parser backend (T015, 003 US3).
//
// Proves the parse layer is genuinely pluggable beyond the TypeScript compiler:
// a tiny `.env`-style `KEY=value` reader behind the SAME `ParserBackend`
// interface. Unlike the TS backend it resolves no types — for a flat key/value
// format there are none to resolve; the structure IS the contract. This is the
// "format-native" backend the SDK's research note anticipated (tree-sitter is
// just another instance of the same interface for richer grammars).

import { readFileSync } from "node:fs";

import type { ParsedSource, ParserBackend } from "./index.js";

/** One `KEY=value` pair, in source order. */
export interface KeyValuePair {
  key: string;
  value: string;
}

/** Handle exposed by the keyvalue backend. */
export interface KeyValueParsedSource {
  /** Non-comment, non-blank pairs in source order. */
  pairs: KeyValuePair[];
  /** Raw source text (for ingesters that want the original). */
  text: string;
}

export const keyvalueBackend: ParserBackend<KeyValueParsedSource> = {
  name: "keyvalue",
  parse(sourcePath: string): ParsedSource<KeyValueParsedSource> {
    const text = readFileSync(sourcePath, "utf8");
    const pairs: KeyValuePair[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      // Skip blanks and comments. Tolerate BOTH comment styles so re-ingesting
      // engine-emitted output works: `#` for `.env`-native comments and the
      // template's `# from:` line, and `//` for the engine's drift-detection
      // banner + `// from:` source-map comments (constitution VI).
      if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      pairs.push({
        key: trimmed.slice(0, eq).trim(),
        value: trimmed.slice(eq + 1).trim(),
      });
    }
    return { path: sourcePath, tree: { pairs, text } };
  },
};
