// TypeScript-compiler parser backend.
//
// Loads a source file into a TS Program + TypeChecker so ingesters can
// **resolve types**, not just walk syntax. This is the right layer for
// TS/TSX targets (React, NestJS, Drizzle, …) where the primitive's contract
// lives in TS interfaces/types and a CST alone is insufficient.

import ts from "typescript";

import type { ParsedSource, ParserBackend } from "./index.js";

/** Handle exposed by the TS backend: the full program + checker + the parsed SourceFile. */
export interface TsParsedSource {
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFile: ts.SourceFile;
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowJs: false,
  jsx: ts.JsxEmit.Preserve,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: false,
  skipLibCheck: true,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
};

export const typescriptBackend: ParserBackend<TsParsedSource> = {
  name: "typescript",
  parse(sourcePath: string): ParsedSource<TsParsedSource> {
    const program = ts.createProgram([sourcePath], COMPILER_OPTIONS);
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(sourcePath);
    if (!sourceFile) {
      throw new Error(
        `TypeScript backend: could not load source file at ${sourcePath}`,
      );
    }
    return {
      path: sourcePath,
      tree: { program, checker, sourceFile },
    };
  },
};
