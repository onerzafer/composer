# Implementation Plan: Composer works in CommonJS host projects

**Branch**: `002-fix-commonjs-host` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-fix-commonjs-host/spec.md`

## Summary

Composer's compose engine fails inside CommonJS host projects (default NestJS, Express, most Node backends). The TypeScript runtime loader (`tsx`) transpiles workspace modules (`output.map.ts`, audit) to CommonJS when the nearest `package.json` lacks `"type": "module"`, and Node's CJS→ESM interop double-wraps the default export — so `loadOutputMap` returns `{ default: { byPrimitive } }` instead of `{ byPrimitive }`, and compose throws `Cannot read properties of undefined (reading '<Primitive>')`. Fix: make the engine's module loaders shape-aware (descend one `default` level when the outer object lacks the expected shape), and have `composer init` emit a workspace-local `package.json` with `{"type":"module"}` so authored workspace modules are unambiguously ESM. Add a regression test in a CommonJS host fixture and document backend/CommonJS adoption.

## Technical Context

**Language/Version**: TypeScript 5.x on Node ≥ 20 LTS (repo targets Node 20+22 in CI).

**Primary Dependencies**: `tsx` (runtime TS loader), `zod` (catalog schemas), `handlebars` (render). Engine packages: `@composer/core`, `@composer/typescript`, `@composer/cli`.

**Storage**: N/A (filesystem outputs only).

**Testing**: vitest. New regression test under `tests/integration/`.

**Target Platform**: Node CLI + library.

**Project Type**: pnpm monorepo (library/cli) — single-project layout under `packages/*`.

**Performance Goals**: No change; the unwrap is an O(1) property check per compose.

**Constraints**: Zero regression for ESM hosts; no new runtime dependency; fix confined to module-loader helpers + `init`.

**Scale/Scope**: Small, surgical — two loader functions, one `init` addition, one fixture + test, one docs section.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Impact | Status |
|---|---|---|
| I. Schema-Compiled Composition (agent writes only JSON) | Unchanged — fix is in module loading, not the authoring model | PASS |
| III. Atomic Compose | Unchanged — fix is pre-render (loading the output map); atomic staging/commit untouched | PASS |
| V. 30-Line Discipline | N/A — no new templates added by this feature | PASS |
| VI. Drift Detection Mandatory | Unaffected | PASS |
| VII. Custom Adapters Are First-Class | **Reinforced** — adapters/workspaces now load in CommonJS hosts, widening first-class support | PASS |
| IX. TypeScript / Zod Catalog Authoring | Unchanged — workspace modules stay TS; loader simply tolerates CJS interop | PASS |
| X. The Catalog Is the API | Unchanged | PASS |

No violations → Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/002-fix-commonjs-host/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Root-cause + decision record
├── quickstart.md        # Reproduction + validation steps
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Created by /speckit-tasks
```

### Source Code (repository root)

```text
packages/core/src/pipeline/orchestrator.ts   # loadOutputMap + loadAuditModule — add nested-default unwrap (FR-001, FR-002, FR-003)
packages/typescript/src/compile.ts            # verify catalog load path unaffected (PrimitiveNode is a named export, not default)
packages/cli/src/commands/init.ts             # emit workspace package.json {"type":"module"} for --bare and --extends (FR-004)

tests/
├── integration/
│   └── cjs-host.test.ts                       # NEW — compose inside a CommonJS host fixture (FR-005, SC-001)
└── fixtures/
    └── cjs-host/                              # NEW — host package.json WITHOUT "type":"module" + minimal workspace

README.md  (or docs/)                          # CommonJS/backend adoption section (FR-006)
```

**Structure Decision**: Single-project monorepo layout (existing). The fix touches three existing engine/CLI source files plus a new test + fixture and a docs addition — no new packages, no structural change.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
