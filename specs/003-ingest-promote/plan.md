# Implementation Plan: Restrained brownfield ingestion (`ingest` + `promote`)

**Branch**: `003-ingest-promote` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-ingest-promote/spec.md`

## Summary

Build the constitution-clean half of brownfield ingestion: a CLI `ingest` that derives candidate primitives from existing source into the engine-ignored quarantine (`design/catalog/ingested/`), and a CLI `promote` that — and only which — moves a human-reviewed draft into the live catalog. Ingestion logic is authored per-framework via a `defineIngester` SDK (the inverse codec of `defineAdapter`), with a **pluggable, type-aware parse layer** (TypeScript compiler for TS; tree-sitter/native as a fallback for other languages). The agent is excluded; the human `promote` gate is the load-bearing invariant. First plugin: `@composer/ingest-react`.

## Technical Context

**Language/Version**: TypeScript 5.x on Node ≥ 20 LTS (existing monorepo).

**Primary Dependencies**: existing — `tsx`, `zod`, `handlebars`. New — a type-aware TS analysis lib for the React backend (e.g. `ts-morph` / the `typescript` compiler API; `react-docgen-typescript`-style prop extraction). `tree-sitter` is introduced ONLY when a non-TS plugin needs it (US3), not in the first cut.

**Storage**: filesystem — drafts to `design/catalog/ingested/`, promoted output to `design/catalog/primitives/` (+ templates).

**Testing**: vitest. New: ingest→quarantine inertness test, promote test, bijection round-trip for a paired adapter+ingester.

**Target Platform**: Node CLI + library.

**Project Type**: pnpm monorepo. New packages: `@composer/ingest-kit` (the SDK + shared orchestration types) and `@composer/ingest-react` (first plugin). CLI gains `ingest`/`promote` commands (replacing the reserved exit-99 stubs).

**Performance Goals**: ingestion is an interactive authoring action, not a hot path; correctness + determinism (round-trip) over speed.

**Constraints**: the human gate (FR-003) is mechanically enforced; agent surface unchanged; no auto-promote; 30-line discipline preserved.

**Scale/Scope**: first cut = `ingest`/`promote` orchestration + `defineIngester` SDK + React plugin (TS-compiler backend). Non-TS/tree-sitter backend is a proof-of-pluggability (US3), kept minimal.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Impact | Status |
|---|---|---|
| I. Schema-Compiled Composition (LLM never writes code) | Preserved — ingestion derives drafts; a human authors/approves the grammar via `promote`. The LLM is not involved. | PASS |
| II. Three Surfaces, One Owner Each | Preserved — catalog stays human-owned; `promote` is the human act that changes it. Drafts are inert until then. | PASS |
| IV. No Escape Hatches on the Agent Surface | Preserved — `ingest`/`promote` are CLI-only; no MCP tool added (FR-004). | PASS |
| V. 30-Line Discipline | Enforced — `doctor` flags oversized derived templates (FR-010). | PASS |
| VI. Drift Detection | Unaffected — promoted primitives obey the same drift rules. | PASS |
| VII. Custom Adapters Are First-Class | **Reinforced** — `defineIngester` makes the reverse codec a first-class authoring surface alongside `defineAdapter`. | PASS |
| VIII. Total Functional Language | Preserved — no meta-primitive / self-growing grammar; the grammar only changes via human `promote`, never via compose. | PASS |
| X. The Catalog Is the API | Preserved — promoted primitives carry the same single-record metadata; drafts are not part of the API until promoted. | PASS |

No violations → Complexity Tracking not required. (The rejected designs — auto-grow during compose, meta-primitives — are documented in `research.md` as the alternatives this plan deliberately does not build.)

## Project Structure

### Documentation (this feature)

```text
specs/003-ingest-promote/
├── plan.md, spec.md, research.md, quickstart.md
├── checklists/requirements.md
└── tasks.md            # created by /speckit-tasks
```

### Source Code (repository root)

```text
packages/ingest-kit/                 # NEW — the defineIngester SDK + shared types
  src/define-ingester.ts             #   defineIngester(): codec contract (parse backend + AST→primitive + emit template)
  src/parser/                        #   pluggable parse-layer interface; TS-compiler backend; tree-sitter backend is additive (US3)
  src/draft.ts                       #   candidate-primitive (draft) shape + quarantine writer
packages/ingest-react/               # NEW — first plugin (TSX prop-types → primitive), TS-compiler backend
packages/cli/src/commands/
  ingest.ts                          # NEW — composer ingest <plugin> <source>  (replaces reserved stub)
  promote.ts                         # NEW — composer promote <draft>           (replaces reserved stub)
  reserved.ts                        # ingest/promote removed from the exit-99 reserved set
packages/core/                       # quarantine already engine-ignored (001 FR-023); add bijection-ingester harness hook
packages/cli/src/commands/doctor.ts  # extend 30-line report to cover ingested/promoted templates (FR-010)

tests/
  integration/ingest-quarantine.test.ts   # NEW — drafts are inert until promote (SC-002)
  integration/promote.test.ts              # NEW — promote moves draft → live; conflict refused (FR-002/FR-007)
  contract/ingest-bijection.test.ts        # NEW — ingest→compose→re-ingest round-trip (FR-009/SC-003)
  fixtures/ingest-react/                    # NEW — a sample .tsx component to ingest
```

**Structure Decision**: Two new packages (`ingest-kit` SDK + `ingest-react` plugin) plus two new CLI commands, layered on the existing engine. The quarantine inertness is already guaranteed by `001`; this feature adds the derive/promote orchestration and the SDK. The parse layer is an interface with a TS-compiler backend now and a tree-sitter backend added only when US3's non-TS plugin needs it.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty. (Deliberately-rejected expansions live in `research.md`.)
