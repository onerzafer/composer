// Pluggable parse layer.
//
// Each backend turns a source file into an analyzable representation. The
// interface is deliberately minimal so different ecosystems can plug in:
//   - `typescript`  — TS compiler + checker (for TS/TSX targets — the default)
//   - `tree-sitter` — concrete-syntax tree (for non-TS targets that don't
//                     have a rich first-party AST; v0 deferred to US3)
//
// Type parameter `T` is opaque to the orchestration code — only the calling
// ingester knows what its backend exposes.

export interface ParsedSource<T> {
  /** Absolute source path. */
  path: string;
  /** Backend-specific parsed handle. */
  tree: T;
}

export interface ParserBackend<T> {
  /** Backend id, e.g. "typescript", "tree-sitter". */
  name: string;
  /** Parse a single source file into the backend's representation. */
  parse(sourcePath: string): ParsedSource<T>;
}

// Concrete backends (typescriptBackend, future tree-sitter) are re-exported
// from the package's top-level src/index.ts — not from this file — so that
// parser/typescript.ts can depend on the interfaces here without a cycle.
