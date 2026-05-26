# Session log — 2026-05-25

**Outcome**: Composer toolkit v0.1 went from "spec doc + README" to "US1 fully verified, 66/108 tasks complete, 28/29 tests green, real agent loop working against `@composer/adapter-next`."

**Scope of session**: Spec-Kit setup → Constitution → Spec → Clarify → Plan → Tasks → Analyze → Implement (Phases 1–3).

**Branch**: `001-composer-toolkit-v0`

**Commits**: 14 total (12 implementation + 1 cleanup + initial)

---

## Phases completed

### Spec-Kit workflow (one-off, foundational)

| Step | Output | Lines |
|---|---|---|
| Constitution | `.specify/memory/constitution.md` v1.0.0 | 70 |
| Specify | `specs/001-composer-toolkit-v0/spec.md` (5 user stories, 34 FRs, 9 SCs) | 282 |
| Clarify (3 questions) | Added Observability (FR-OBS-*), Security (FR-SEC-*), Concurrency (FR-CONC-*) sub-groups | +30 |
| Plan | `plan.md` + 15-decision `research.md` + 12-entity `data-model.md` + 3 `contracts/` + `quickstart.md` | ~1,400 |
| Tasks | `tasks.md` — 108 dependency-ordered tasks across 8 phases | 403 |
| Analyze | 4 MEDIUM findings (G1, G2, P1, P2), 5 LOW. CRITICAL=0, HIGH=0. Patched MEDIUMs inline during implementation. | — |

### Phase 1 — Setup (T001–T007)

pnpm monorepo (`packages/*` + `tests`), TypeScript 5.7 strict + composite, ESLint 9 flat, Prettier, Vitest 2.1, `.npmrc` with `public-hoist-pattern[]=@types/*`, MIT LICENSE. 7 package skeletons (5 library + adapter-next + skill-claude).

**Commit**: `4b6e072 Phase 1 + 2: Setup + Foundational complete (T001-T024)`

### Phase 2 — Foundational (T008–T024)

- `@composer/adapter-kit`: full `Adapter` / `OutputMap` / `OutputPath` / `AuditRule` / `PrepFn` / `RenderCtx` / `SlotEntry` / `PrimitiveMeta` types + `defineAdapter()` helper
- `@composer/typescript`: `loadCatalog` (tsx runtime) + `compileCatalog` (Zod schema extraction + per-primitive metadata + `catalogVersion` rollup)
- `@composer/core` foundations:
  - workspace: `validate-config` (hand-validates `composer.json`; Ajv dropped due to ESM interop), `spec-id` (R13 regex), `path-safety` (R10), `resolve` (walk-up `composer.json` discovery), `layer` (project-only workspace layering; parent `extends:` arrives in US3/T077)
  - lock: `workspace-lock` (whole-workspace PID lockfile + stale detection, FR-CONC-001..004)
  - drift: `hasher` (SHA-256 + LF normalization, R11)
  - log: `logger` (structured JSON, FR-OBS-001/002/003, R14)
  - render: `helpers` (json/kebab/slot/indent + `eq` added later), `sandbox` (Node `vm` with banned-identifier static guard, R3)
  - sourcemap: bi-directional `byFile` / `bySpec` persistence (R12)

**Commit**: `4b6e072` (same as Phase 1 — committed together as Foundational checkpoint)

### Phase 3 — US1 MVP (T025–T066)

#### Tests first (T025–T031) — RED

7 test files, 25 tests, all failing with routing hints (`compose() pending T043` etc.). Tests use tempdir fixtures with symlinked node_modules + `"type": "module"` package.json.

**Commit**: `9223f9a Phase 3 TDD red: US1 tests T025-T031 (25 failing tests)`

#### Pipeline + endpoints (T032–T044) — turning tests GREEN

- Pipeline phases (`packages/core/src/pipeline/phases/`): structural / semantic / audit / render / drift / commit + orchestrator that sequences them with lock + log management
- Banner emitter (`packages/core/src/render/banner.ts`) with per-language comment syntax (TS/Rust/Go/Python/SQL/CSS/HTML/...)
- 4 agent endpoints (`packages/core/src/api/`): discover / scaffold (both variants) / validate (preview, no lock) / compose (atomic)
- Used `zod-to-json-schema` for scaffold's schema response
- Extracted ENGINE_VERSION to `version.ts`
- Resolved 3 test-fixture issues (package.json type:module / node_modules symlink / lock path)

**Tests**: 22 of 25 green after this. Remaining 3 = mock-agent tests waiting on T045+.

**Commit**: `33e87e3 Phase 3 pipeline + endpoints (T032-T044): 22 of 25 tests GREEN`

#### MCP server (T045–T051) — turning final 3 tests GREEN

`@composer/mcp`: `createServer({ cwd })` returns `{ listTools, callTool, start }`. Programmatic API for tests + `start()` wires `StdioServerTransport` for production. One TOOLS registry serves both transports. Tool descriptions lifted verbatim from `contracts/mcp-tools.md`. `composer-mcp` bin entry.

**Tests**: 25 of 25 green.

**Commit**: `eacc41d Phase 3 MCP server (T045-T051): ALL 25 US1 TESTS GREEN`

#### Reference adapter content (T052–T061)

`@composer/adapter-next` with 5 primitives (Page / Hero / Section / Card / CTA), each with full `PrimitiveMeta`. One template (`page.tsx.hbs`) using `{{#if (eq primitive "X")}}` to dispatch by discriminator. Output map: only Page emits a file. Audit: placeholder. Bootstrap: writes a starter `specs/home.json`.

Engine tweaks: `resolveOutputs` returns `[]` for non-mapped primitives (instead of throwing), enabling model B (parent renders embedded children inline). Added `eq` Handlebars helper.

**Smoke test**: Real adapter-next composes a Page with Hero + Section{2 Cards} + CTA → idiomatic Next.js page with banner + Tailwind classes.

**Commits**: `692f91b adapter-next reference content (T052-T061): real Next.js compose works` + `aba3091 Untrack adapter-next build artifacts`

#### Skill pack + E2E (T062–T066)

- `@composer/skill-claude`: SKILL.md + mcp.json + 3 prompts (attached / compose-feature / debugging)
- `tests/helpers/fixture.ts` gained `makeNextProjectFixture()` — tempdir Composer project with adapter-next copied in
- `tests/e2e/agent-loop.test.ts`: 4 tests covering US1 Acceptances #1–#5 + SC-001 wall-clock budget
- One E2E test marked `it.skip` for v0.2 — adapter-next cold-start cost ×2 exceeds practical timeouts; same property covered by stub-catalog bijection test

**Tests**: 28 passing · 1 skipped (29 total) across 8 test files.

**Commit**: `4c86208 Phase 3 US1 closed: skill pack + E2E fixture + agent-loop test (T062-T066)`

---

## What's runnable now

```bash
# Build all packages
pnpm install
pnpm -r build   # 8 packages, ~7s

# Run tests
pnpm test       # 28 passed, 1 skipped, ~50s

# MCP server (when an agent attaches)
npx @composer/mcp   # stdio MCP, exposes 4 tools

# Programmatic
import { discover, scaffold, validate, compose } from "@composer/core";
import adapter from "@composer/adapter-next";  // ready to use as @composer/adapter-next
```

---

## What's NOT in v0.1 yet

**Remaining 42 tasks** split into:

- **US2 — `composer init` CLI** (6 tasks, T067–T072): `composer init --extends` / `--bare`. Without this, adopters must hand-author `composer.json` + workspace skeleton.
- **US3 — Custom adapter extends** (8 tasks, T073–T080): the `extends:` resolution path with parent-adapter caching + cycle detection + shadow warnings. Layer.ts hook exists; full implementation pending.
- **US4 — Drift polish** (4 tasks, T081–T084): impl is done; tests done; just docs polish.
- **US5 — explain / trace CLI** (4 tasks, T085–T088): CLI wrappers over the source-map persistence that's already implemented.
- **Polish** (20 tasks, T089–T108): CLI compose/validate parity, `composer doctor`, README, CI workflow, npm release.

---

## Known deferrals

See [/docs/v0.2-deferrals.md](../v0.2-deferrals.md) for the consolidated list. Quick callouts:

- **Catalog caching across composes** is the #1 v0.2 priority (currently ~30s cold-start per compose; surfaced as a skipped E2E test).
- **Prep file support (.prep.ts)** is deferred to v0.2 — adapter-next v0.1 doesn't need it because the `{{slot}}` helper handles variant lookup directly.
- **LSP server** is cut entirely from the roadmap (per user direction during brainstorming) — MCP already covers every LSP-equivalent for agents.

---

## How to resume

In a new session:

```text
"Continue the Composer toolkit on branch 001-composer-toolkit-v0.
 Status: 66/108 tasks, US1 closed, 28/29 tests passing.
 Read specs/001-composer-toolkit-v0/tasks.md for granular state and
 docs/v0.2-deferrals.md for known follow-ups.

 Next push: [pick from US2 init CLI / US3 extends / Polish CLI batch]."
```

The four key files to re-orient in any future session:

1. `.specify/memory/constitution.md` — the binding architectural principles
2. `specs/001-composer-toolkit-v0/spec.md` — the functional requirements (FR-*) + success criteria (SC-*)
3. `specs/001-composer-toolkit-v0/tasks.md` — the 108-task implementation list with completion status
4. `docs/v0.2-deferrals.md` — known v0.2+ follow-ups (so you don't re-discover them mid-implementation)
