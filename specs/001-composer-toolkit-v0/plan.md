# Implementation Plan: Composer Toolkit v0.1

**Branch**: `001-composer-toolkit-v0` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-composer-toolkit-v0/spec.md`

**Reference design**: [/docs/superpowers/specs/2026-05-25-composer-design.md](../../docs/superpowers/specs/2026-05-25-composer-design.md) (790 lines)

**Reference methodology**: [/README.md](../../README.md) (Schema-Compiled Composition, 388 lines)

## Summary

Composer v0.1 ships a Node.js monorepo of seven packages that together implement the Schema-Compiled Composition loop for LLM coding agents: a core engine library, an MCP server (4 workflow tools), a CLI binary (init/compose/validate/explain/trace/doctor), a catalog-authoring engine (TS/Zod), a reference adapter for Next.js, a shared adapter-kit, and a Claude Code skill pack. The agent loop is `discover → scaffold → [validate?] → compose`. The compose operation is atomic (write everything or nothing), with drift detection, source-map persistence, structured JSON logging, and a whole-workspace lockfile preventing concurrent writes. Output language is unconstrained via per-primitive Handlebars templates with optional sandboxed TS data-prep.

## Technical Context

**Language/Version**: TypeScript 5.5+, targeting Node.js 20 LTS+

**Primary Dependencies**:
- `zod` ^3.23 — discriminated-union schemas + structural validation
- `handlebars` ^4.7 — logic-less template engine
- `ts-morph` ^23 — TypeScript AST loader for catalog files (Phase 0 candidate; alternative: native `typescript` compiler API)
- `@modelcontextprotocol/sdk` ^1 — MCP server stdio transport
- `commander` ^12 — CLI argument parsing (Phase 0 candidate; alternatives: `cac`, `oclif`)
- `tsx` ^4 — dev-time TS loader for `*.prep.ts` and catalog files
- `vm2` removed/unmaintained — for sandbox use Node's built-in `vm` with restricted globals (Phase 0 decision)

**Storage**: Filesystem only.
- Specs: `<workspace>/specs/<spec_id>.json`
- Generated source: paths declared by `output.map.ts`
- Cache: `<workspace>/.composer/cache/` (catalog.compiled.js, sourcemap.json, output.hashes.json, parent adapter mirror, compose.lock)
- Logs: `<workspace>/.composer/logs/<ts>-<spec_id>.json` and `<ts>-<spec_id>-validate.json`

**Testing**: vitest ^2 for unit and contract tests; custom mock-agent harness for MCP integration tests; fixture-based snapshot tests for templates; bijection-check tests per reference-adapter primitive.

**Target Platform**: macOS, Linux (POSIX-first). Windows best-effort; Spec-Kit's PowerShell scripts already coexist, so CLI commands accept either bash or pwsh harness wrappers.

**Project Type**: Monorepo (pnpm workspaces) shipping multiple npm packages under the `@composer/` scope.

**Performance Goals** (derived from spec SC-NNN):
- SC-001: `discover → scaffold → compose` to type-checked file in ≤ 60s wall-clock on consumer hardware
- SC-002: `composer init` to working project in ≤ 30s
- SC-005: `composer explain` answer in ≤ 1s for projects with ≤ 100 specs
- SC-009: `discover` MCP response ≤ 5,000 tokens for the reference adapter

**Constraints**:
- No daemon process (one-shot CLI / per-invocation MCP server in v0.1)
- No network calls during `compose` (catalog/templates already on disk; adapters pre-cached at init)
- No filesystem access from template prep (sandboxed per FR-011/017)
- Whole-workspace lock during compose (FR-CONC-001..004)

**Scale/Scope**:
- Up to 100 primitives per workspace (warn at 50 per README §10)
- Up to 1000 specs per workspace
- Up to 10,000 LOC across catalog files
- Single compose at a time (FR-CONC-001)
- Multi-agent attach via shared stdio MCP server, serialized by the workspace lock

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verifying each principle of `.specify/memory/constitution.md` v1.0.0:

| Principle | Status | Evidence |
|---|---|---|
| I. Schema-Compiled Composition | ✓ | LLM-only writes JSON specs; engine compiles to source. No code-writing tool on the agent surface. |
| II. Three Surfaces, One Owner Each | ✓ | Catalog (humans / `<workspace>/catalog/`), Composition (LLM / `<workspace>/specs/*.json`), Compiler (`@composer/core`). MCP fenced into surface 2. |
| III. Atomic Compose | ✓ | FR-003, FR-CONC-001..004, edge-cases entry on partial-failure rollback. Staging-dir + atomic-rename in design doc step 9. |
| IV. No Escape Hatches on Agent Surface | ✓ | FR-001, FR-002. Exactly 4 MCP tools; no list/read primitives. |
| V. 30-Line Discipline | ✓ | FR-006, `composer doctor` flag (FR-021), SC-006 (≥90% templates compliant). |
| VI. Drift Detection Mandatory | ✓ | FR-013/014/015/016, dedicated User Story 4, SC-003 (100% catch). |
| VII. Custom Adapters First-Class | ✓ | FR-005/006/007/008, User Story 3, layered resolution rules, `adapter-kit` package. |
| VIII. Total Functional Language | ✓ | Reference adapter declares zero control-flow primitives. `composer doctor` flags any primitive named `while`/`if`/`async`. |
| IX. TS/Zod Catalog Authoring | ✓ | `engine: "@composer/typescript@1"` pinned. No polyglot in v0.1 per non-goals. |
| X. Catalog Is the API | ✓ | `scaffold` returns schema + intent + whenToUse + whenNotToUse + fieldGuidance + examples from the same primitive record (the design's primitive-contract object). |

**Gate result**: PASS. No violations. Complexity-tracking table below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-composer-toolkit-v0/
├── spec.md              # Feature spec (clarified — 5 user stories, 31+ FRs, 9 SCs)
├── plan.md              # This file
├── research.md          # Phase 0 — resolved technical unknowns
├── data-model.md        # Phase 1 — entities + relationships
├── contracts/           # Phase 1 — MCP, CLI, composer.json contracts
│   ├── mcp-tools.md
│   ├── cli-commands.md
│   └── composer-json.schema.json
├── quickstart.md        # Phase 1 — developer onboarding walkthrough
└── tasks.md             # Phase 2 — generated by /speckit-tasks (not by this command)
```

### Source Code (repository root)

```text
composer/
├── packages/
│   ├── core/                    @composer/core
│   │   ├── src/
│   │   │   ├── workspace/       resolve composer.json, load extends, layer
│   │   │   ├── catalog/         load TS catalog, compile Zod, cache
│   │   │   ├── pipeline/        compose pipeline (parse, validate, audit, render, drift, write)
│   │   │   ├── render/          Handlebars renderer + prep sandbox + helpers
│   │   │   ├── drift/           hash store + drift detection
│   │   │   ├── sourcemap/       bi-directional source map persistence
│   │   │   ├── lock/            workspace lockfile (PID + stale detection)
│   │   │   ├── log/             structured JSON logger
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── mcp/                     @composer/mcp
│   │   ├── src/
│   │   │   ├── tools/           discover, scaffold, validate, compose
│   │   │   ├── server.ts        stdio MCP server entry
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── cli/                     @composer/cli
│   │   ├── src/
│   │   │   ├── commands/        init, compose, validate, explain, trace, doctor
│   │   │   └── index.ts         (bin entrypoint: `composer`)
│   │   └── tests/
│   │
│   ├── typescript/              @composer/typescript
│   │   ├── src/
│   │   │   ├── loader.ts        load catalog/*.ts via ts-morph or tsx
│   │   │   ├── compile.ts       Zod schema compilation + cache
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── adapter-kit/             @composer/adapter-kit
│   │   ├── src/
│   │   │   ├── types.ts         Adapter, OutputMap, AuditRule, PrepFn, SlotEntry
│   │   │   └── helpers.ts       defineAdapter(), commonly used utilities
│   │   └── tests/
│   │
│   ├── adapter-next/            @composer/adapter-next   (reference)
│   │   ├── catalog/             primitives: Page, Hero, Section, Card, Form, etc.
│   │   ├── templates/           *.tsx.hbs + *.prep.ts per primitive
│   │   ├── output.map.ts
│   │   ├── audit.ts
│   │   ├── bootstrap.ts
│   │   └── index.ts
│   │
│   └── skill-claude/            @composer/skill-claude
│       ├── SKILL.md             prose for Claude Code skill discovery
│       ├── mcp.json             { "composer": { "command": "npx", "args": [...] } }
│       └── prompts/
│
├── tests/
│   ├── integration/             end-to-end MCP harness, init→compose flows
│   ├── e2e/                     full agent-loop scenarios
│   └── fixtures/
│       └── next-project/        canonical fixture used by integration tests
│
├── docs/
│   ├── superpowers/specs/       (existing — source design)
│   ├── adapters/                authorship guide
│   └── methodology/             SCC references and pointers to README
│
├── scripts/
├── package.json                 root workspace manifest
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md                    (existing)
├── CLAUDE.md                    (Spec-Kit-managed pointer)
└── composer.json                (Composer dogfoods itself — uses adapter-next on dogfood project, see Phase 2)
```

**Structure Decision**: Monorepo via pnpm workspaces. Seven `@composer/*` packages with a shared `tsconfig.base.json` and a root `package.json` declaring workspaces. Tests split between per-package `packages/*/tests/` (unit + contract) and top-level `tests/integration/` and `tests/e2e/`. The `packages/adapter-next/` is published AS the reference adapter (not a "demo" — it ships).

## Complexity Tracking

No constitution violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| (none) | — | — |

---

## Phase 0 → Phase 1 outputs

Phase 0 research is in [`research.md`](./research.md) — resolves: ts-loader choice (ts-morph vs tsx vs native), CLI library choice (commander vs cac vs oclif), prep sandbox mechanism (vm vs worker_threads), MCP transport stability, performance targets validation.

Phase 1 design artifacts:
- [`data-model.md`](./data-model.md) — 8 key entities + relationships + lifecycle
- [`contracts/mcp-tools.md`](./contracts/mcp-tools.md) — MCP tool JSON schemas (request/response shapes)
- [`contracts/cli-commands.md`](./contracts/cli-commands.md) — CLI command signatures + exit codes
- [`contracts/composer-json.schema.json`](./contracts/composer-json.schema.json) — JSON Schema for the project pointer file
- [`quickstart.md`](./quickstart.md) — 5-minute onboarding for an adopter

## Post-design constitution re-check

After Phase 1 contracts are written, re-verifying:

| Principle | Phase 1 evidence |
|---|---|
| III. Atomic Compose | `contracts/mcp-tools.md` documents compose as transactional with explicit rollback semantics. |
| IV. No Escape Hatches | `contracts/mcp-tools.md` exposes exactly 4 tools; no list/read MCP tools added. |
| VI. Drift Detection | `data-model.md` includes OutputHashRecord entity; contracts specify failure-on-mismatch. |
| VII. Custom Adapters | `data-model.md` includes Adapter entity with `extends` relationship; `contracts/composer-json.schema.json` validates the optional `extends` field. |

**Post-design gate**: PASS.

## Next command

After plan artifacts are reviewed: run `/speckit-tasks` to generate `tasks.md` (dependency-ordered, story-grouped task list ready for `/speckit-implement`).
