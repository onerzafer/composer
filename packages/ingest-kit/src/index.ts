// Public API of @composer/ingest-kit.

export type {
  CandidateDraft,
  IngesterContext,
  IngesterPlugin,
} from "./types.js";

export { writeDraft } from "./draft.js";
export type { WrittenDraft } from "./draft.js";

// The defineIngester SDK — the codec authoring surface (sibling of defineAdapter).
export { defineIngester } from "./define-ingester.js";
export type { Ingester, IngesterDefinition } from "./define-ingester.js";

// Pluggable parse layer + bundled backends.
export type { ParserBackend, ParsedSource } from "./parser/index.js";
export { typescriptBackend } from "./parser/typescript.js";
export type { TsParsedSource } from "./parser/typescript.js";
export { keyvalueBackend } from "./parser/keyvalue.js";
export type {
  KeyValuePair,
  KeyValueParsedSource,
} from "./parser/keyvalue.js";
