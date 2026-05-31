// `defineIngester` — the SDK entrypoint for authoring an ingester (T012, 003 US2).
//
// An ingester is the *inverse codec* of an adapter's templates:
//   - forward  (adapter):  JSON spec  → code        (compose, via templates)
//   - reverse  (ingester):  code       → primitive   (ingest / decode)
//
// `defineIngester` is symmetric with `@composer/adapter-kit`'s `defineAdapter`:
// it is an identity-style helper that takes a declarative codec definition and
// returns a ready `IngesterPlugin`. The codec is three pieces:
//
//   1. `backend`  — a pluggable parser (type-aware TS compiler for TS sources,
//                   a format-native backend for others). The shared layer is
//                   the orchestration, NOT the parser (research Decision 3).
//   2. `extract`  — parsed source → candidate primitive *drafts* (Zod schema +
//                   draft template + metadata stub). This is what `composer
//                   ingest` writes to quarantine for human review + `promote`.
//   3. `decode`   — OPTIONAL. parsed source → JSON spec *instance(s)*: the true
//                   inverse of `compose`. Lets a paired adapter+ingester satisfy
//                   the bijection check (ingest → compose → re-ingest round-trips
//                   the JSON — FR-009 / SC-003 / design §15.5).
//
// `extract` derives the *grammar* (schema); `decode` recovers an *instance*.
// An ingester needs `extract` to participate in `composer ingest`; it adds
// `decode` only when it is paired with an adapter for the bijection harness.

import type { ParsedSource, ParserBackend } from "./parser/index.js";
import type {
  CandidateDraft,
  IngesterContext,
  IngesterPlugin,
} from "./types.js";

/** The declarative codec an author hands to `defineIngester`. */
export interface IngesterDefinition<T, Node = Record<string, unknown>> {
  /** Plugin id — matches the CLI argument (e.g. `react`) and the package suffix. */
  name: string;
  /** The parser backend this ingester reads through. */
  backend: ParserBackend<T>;
  /**
   * Schema-derivation: parsed source → candidate primitive drafts. Drives
   * `composer ingest` (the drafts land in quarantine awaiting `promote`).
   */
  extract(
    parsed: ParsedSource<T>,
    ctx: IngesterContext,
  ): CandidateDraft[] | Promise<CandidateDraft[]>;
  /**
   * Instance-recovery (optional): parsed source → JSON spec node(s) — the
   * inverse of `compose`. An ingester paired with an adapter implements this so
   * the bijection round-trip (ingest → compose → re-ingest) reproduces the JSON.
   */
  decode?(parsed: ParsedSource<T>): Node[] | Promise<Node[]>;
}

/**
 * A fully-assembled ingester. Extends `IngesterPlugin` (so it plugs into
 * `composer ingest` unchanged) while keeping the codec pieces reachable so
 * harnesses — notably the bijection check — can call `decode`/`backend` directly.
 */
export interface Ingester<T = unknown, Node = Record<string, unknown>>
  extends IngesterPlugin {
  backend: ParserBackend<T>;
  extract(
    parsed: ParsedSource<T>,
    ctx: IngesterContext,
  ): CandidateDraft[] | Promise<CandidateDraft[]>;
  decode?(parsed: ParsedSource<T>): Node[] | Promise<Node[]>;
}

/**
 * Declare an ingester from a codec definition. Synthesizes the `ingest()`
 * entrypoint (parse → extract) the CLI calls, and forwards the codec pieces.
 *
 * @example
 *   export default defineIngester({
 *     name: "react",
 *     backend: typescriptBackend,
 *     extract(parsed, ctx) { ... return [draft]; },
 *   });
 */
export function defineIngester<T, Node = Record<string, unknown>>(
  def: IngesterDefinition<T, Node>,
): Ingester<T, Node> {
  return {
    name: def.name,
    backend: def.backend,
    extract: def.extract,
    decode: def.decode,
    async ingest(
      sourcePath: string,
      ctx: IngesterContext,
    ): Promise<CandidateDraft[]> {
      const parsed = def.backend.parse(sourcePath);
      return def.extract(parsed, ctx);
    },
  };
}
