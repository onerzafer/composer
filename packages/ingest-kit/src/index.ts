// Public API of @composer/ingest-kit.

export type {
  CandidateDraft,
  IngesterContext,
  IngesterPlugin,
} from "./types.js";

export { writeDraft } from "./draft.js";
export type { WrittenDraft } from "./draft.js";

export type { ParserBackend, ParsedSource } from "./parser/index.js";
export { typescriptBackend } from "./parser/typescript.js";
export type { TsParsedSource } from "./parser/typescript.js";
