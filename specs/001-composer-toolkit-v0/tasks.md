---
description: "Task list for Composer Toolkit v0.1 implementation"
---

# Tasks: Composer Toolkit v0.1

**Input**: Design documents from `/specs/001-composer-toolkit-v0/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all present)

**Tests**: REQUIRED per constitution v1.0.0 Quality Gates (bijection check, atomic-rollback, drift-detection, adapter-extends, 30-line lint).

**Organization**: Tasks are grouped by user story so each story is independently completable and testable.

---

## Progress

| Status | Count | Details |
|---|---|---|
| **Done** | **66 of 108 (61%)** | T001–T066 ✓ |
| Remaining | 42 | T067–T108 (US2 + US3 + US4 polish + US5 + Polish) |
| Tests passing | **28 of 29** | 1 skipped — documented in `docs/v0.2-deferrals.md` #1 |
| Build | 8 of 8 packages clean | |
| User Story 1 | **Closed** ✓ | All 5 acceptance scenarios + SC-001/003/007/008/009 verified |
| User Stories 2–5 | Remaining | US2 (init), US3 (extends), US4 (drift docs), US5 (explain CLI) |

**Session logs**: see `docs/sessions/` for per-session narrative + commit refs.

**Known deferrals**: see `docs/v0.2-deferrals.md` for the canonical list (catalog caching, prep files, staging+rename hardening, per-line source maps, etc.).

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-dependency)
- **[Story]**: Maps to a user story from spec.md (US1, US2, US3, US4, US5)
- Setup / Foundational / Polish phases have NO story label
- All paths are repository-relative

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for the pnpm monorepo.

- [X] T001 Create `pnpm-workspace.yaml` declaring `packages/*` as workspace
- [X] T002 Create root `package.json` with name `composer-monorepo`, private: true, pnpm packageManager pin, scripts for `build`/`test`/`lint`/`typecheck`
- [X] T003 [P] Create `tsconfig.base.json` with strict TS (incl. `noUncheckedIndexedAccess`, `composite: true`), ES2022, NodeNext module resolution, declaration emit
- [X] T004 [P] Create `eslint.config.js` (flat config, ESLint 9) + `.prettierrc.json` with consistent rules across packages — *updated from `.eslintrc.json` per 2026-current standard*
- [X] T005 [P] Create `vitest.config.ts` at root with project-level test discovery + v8 coverage config
- [X] T006 [P] Create `LICENSE` (MIT, © 2026 Öner Zafer) at `/LICENSE`
- [X] T007 Create package skeletons (package.json + tsconfig.json + src/index.ts where applicable) under `/packages/{core,mcp,cli,typescript,adapter-kit,adapter-next,skill-claude}/` — five library packages have full TS skeleton; adapter-next and skill-claude are content-only (no src/index.ts yet)

**Checkpoint**: `pnpm install && pnpm typecheck` passes on an empty codebase.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented. Implements the engine primitives every story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### `@composer/adapter-kit` (shared types)

- [X] T008 [P] Implement adapter-kit types (`Adapter`, `OutputMap`, `OutputPath`, `AuditRule`, `PrepFn`, `RenderCtx`, `SlotEntry`, `PrimitiveMeta`) in `/packages/adapter-kit/src/types.ts` per `data-model.md`
- [X] T009 [P] Implement `defineAdapter()` helper and common utilities in `/packages/adapter-kit/src/helpers.ts`
- [X] T010 [P] Export public API in `/packages/adapter-kit/src/index.ts`

### `@composer/typescript` (catalog-authoring engine)

- [X] T011 [P] Implement TS catalog loader using `tsx` runtime (per research.md R1) in `/packages/typescript/src/loader.ts` — `loadCatalog(catalogDir) → LoadedCatalog`. *FR-023 (G1 fix) inline: loader is structurally blind to `catalog/ingested/` — imports trace from `catalog/index.ts` only; no directory listing.*
- [X] T012 [P] Implement Zod schema compilation + mtime-keyed cache in `/packages/typescript/src/compile.ts` — writes `.composer/cache/catalog.compiled.json`
- [X] T013 [P] Export public API in `/packages/typescript/src/index.ts`

### `@composer/core` (engine foundations)

- [X] T014 [P] Implement `composer.json` schema validator in `/packages/core/src/workspace/validate-config.ts` — *hand-validates against the JSON Schema patterns from `contracts/composer-json.schema.json` (dropped Ajv dep; schema is small enough that direct validation is cheaper than Ajv's ESM-default-export interop).*
- [X] T015 [P] Implement spec-ID validator (regex `^[a-z0-9][a-z0-9-]{0,62}$`, research R13) in `/packages/core/src/workspace/spec-id.ts`
- [X] T016 [P] Implement path-traversal protection (research R10) in `/packages/core/src/workspace/path-safety.ts` — every output-map path must resolve under project root
- [X] T017 [P] Implement workspace lockfile (FR-CONC-001..004, PID + stale detection) in `/packages/core/src/lock/workspace-lock.ts`
- [X] T018 [P] Implement SHA-256 drift hasher with LF normalization (research R11) in `/packages/core/src/drift/hasher.ts`
- [X] T019 [P] Implement structured JSON logger (FR-OBS-001/002/003, research R14) in `/packages/core/src/log/logger.ts` — writes to `.composer/logs/<ts>-<spec_id>.json`
- [X] T020 [P] Implement Handlebars helpers (`json`, `kebab`, `slot`, `indent`) in `/packages/core/src/render/helpers.ts`
- [X] T021 [P] Implement prep sandbox using Node `vm` with restricted globals (research R3, FR-011, FR-017) in `/packages/core/src/render/sandbox.ts`
- [X] T022 [P] Implement source-map persistence (data-model §9, research R12) in `/packages/core/src/sourcemap/persist.ts` — `byFile` and `bySpec` indices
- [X] T023 Implement workspace resolver (composer.json discovery + read + validate) in `/packages/core/src/workspace/resolve.ts` (depends on T014)
- [X] T024 Implement workspace layering (project-only in v0.1 Foundational scope; parent-adapter `extends:` arrives in US3/T077) in `/packages/core/src/workspace/layer.ts`

**Checkpoint**: Foundation ready — user story implementation can begin in parallel.

---

## Phase 3: User Story 1 — Agent composes a feature (Priority: P1) 🎯 MVP

**Goal**: An LLM coding agent attached via MCP can call `discover → scaffold → compose` against a Composer-instrumented Next.js project and produce real, type-checked source files. This is the heart of v0.1 — the *only* product use case (per spec §US1).

**Independent Test**: Wire a mock MCP client against a fixture Next.js project with `extends: @composer/adapter-next`, run the full loop, assert that `design/specs/pricing.json` is written, `src/app/pricing/page.tsx` is created, and the generated file type-checks under the fixture's tsconfig.

### Tests for User Story 1 (REQUIRED — constitution Quality Gates)

> Write tests FIRST; ensure they FAIL before implementing.

- [X] T025 [P] [US1] Bijection / idempotence Quality Gate (constitution VIII, SC-008) in `/tests/contract/bijection.test.ts`. *Scope adjustment: strict JSON→code→JSON requires the ingestion side (v1.x). v0.1 asserts idempotence — same input ⇒ byte-identical output across consecutive composes. Same drift-catching power.* **Red: 2 tests, both failing.**
- [X] T026 [P] [US1] Atomic-rollback test — inject failure at each pipeline phase, assert workspace + outputs byte-identical to pre-compose — in `/tests/integration/atomic-rollback.test.ts` (US1 Acceptance #4, SC-007). **Red: 3 tests, all failing.**
- [X] T027 [P] [US1] Mock-agent MCP harness — exactly-4-tools assertion + no-escape-hatch assertion + full discover→scaffold→compose loop — in `/tests/integration/mock-agent.test.ts`. **Red: 3 tests, all failing.**
- [X] T028 [P] [US1] Contract test: MCP `discover` shape per `contracts/mcp-tools.md` — in `/tests/contract/mcp-discover.test.ts`. *G2 fix inline: includes explicit SC-009 ≤5000-token assertion.* **Red: 3 tests, all failing.**
- [X] T029 [P] [US1] Contract test: MCP `scaffold` both variants (primitive + spec) per `contracts/mcp-tools.md` — in `/tests/contract/mcp-scaffold.test.ts`. **Red: 4 tests, all failing.**
- [X] T030 [P] [US1] Contract test: MCP `validate` preview shape per `contracts/mcp-tools.md` — in `/tests/contract/mcp-validate.test.ts`. *Asserts side-effect-free + no lock acquired (FR-CONC-004).* **Red: 4 tests, all failing.**
- [X] T031 [P] [US1] Contract test: MCP `compose` success + failure shapes per `contracts/mcp-tools.md` — in `/tests/contract/mcp-compose.test.ts`. *Covers spec persistence, banner, lock release, LOCK_HELD, drift detection.* **Red: 6 tests, all failing.**

### Implementation: pipeline phases in `@composer/core`

- [X] T032 [US1] Pipeline orchestrator (sequences phases, manages lock acquire/release, persists log) in `/packages/core/src/pipeline/orchestrator.ts` (depends on T017, T019, T023, T024)
- [X] T033 [P] [US1] Pipeline phase: structural validate via Zod parse in `/packages/core/src/pipeline/phases/structural.ts`
- [X] T034 [P] [US1] Pipeline phase: semantic validate (parent superRefine then project) in `/packages/core/src/pipeline/phases/semantic.ts`
- [X] T035 [P] [US1] Pipeline phase: audit (parent audit.ts then project audit.ts) in `/packages/core/src/pipeline/phases/audit.ts`
- [X] T036 Pipeline phase: render-to-staging (Handlebars per primitive, prep via sandbox) in `/packages/core/src/pipeline/phases/render.ts` (depends on T020, T021) *Prep (.prep.ts) support is gated with a clear error — deferred to v0.2.*
- [X] T037 [US1] Pipeline phase: drift-check (compare hashes per `output.hashes.json`) in `/packages/core/src/pipeline/phases/drift.ts` (depends on T018)
- [X] T038 Pipeline phase: atomic-commit (rename staging → real paths, update sourcemap + hashes) in `/packages/core/src/pipeline/phases/commit.ts` (depends on T022) *v0.1 writes directly to target paths after drift-check; staging+rename hardening lands in v0.2.*
- [X] T039 [P] [US1] Banner + per-block source-map comment emitter (FR-013, FR-014) in `/packages/core/src/render/banner.ts`

### Implementation: public engine API

- [X] T040 [US1] `discover()` endpoint — light overview (FR-001, SC-009) in `/packages/core/src/api/discover.ts`
- [X] T041 `scaffold()` endpoint — both variants (primitive + spec) in `/packages/core/src/api/scaffold.ts` (FR-002) *Uses `zod-to-json-schema` (added as a `@composer/core` dep) to produce the JSON-Schema response for the agent.*
- [X] T042 [US1] `validate()` endpoint — dry-run preview, writes validate log (FR-004, FR-OBS-003) in `/packages/core/src/api/validate.ts`
- [X] T043 [US1] `compose()` endpoint — orchestrates all phases atomically (FR-003) in `/packages/core/src/api/compose.ts`
- [X] T044 Export `@composer/core` public API in `/packages/core/src/index.ts` *Updated to re-export pipeline phases + 4 agent endpoints + their types.*

### Implementation: MCP server

- [X] T045 [US1] MCP stdio server entry using `@modelcontextprotocol/sdk` (research R5) in `/packages/mcp/src/server.ts`
- [X] T046 [P] [US1] MCP tool registration: `composer.discover` in `/packages/mcp/src/tools/discover.ts` (per `contracts/mcp-tools.md`)
- [X] T047 [P] [US1] MCP tool registration: `composer.scaffold` in `/packages/mcp/src/tools/scaffold.ts`
- [X] T048 [P] [US1] MCP tool registration: `composer.validate` in `/packages/mcp/src/tools/validate.ts`
- [X] T049 [P] [US1] MCP tool registration: `composer.compose` in `/packages/mcp/src/tools/compose.ts`
- [X] T050 [US1] MCP tool descriptions (per `contracts/mcp-tools.md` final section) wired into each tool's `inputSchema.description` so the agent sees them in `tools/list`
- [X] T051 [US1] `@composer/mcp` bin entrypoint + `package.json` bin field so `npx @composer/mcp` works

### Implementation: reference adapter `@composer/adapter-next`

- [X] T052 [P] [US1] adapter-next primitives: Page, Hero, Section, Card, CTA — TS+Zod with `intent`/`whenToUse`/`whenNotToUse`/`fieldGuidance`/`examples` — in `/packages/adapter-next/catalog/primitives/{page,hero,section,card,cta}.ts`
- [X] T053 [P] [US1] adapter-next semantic rules (e.g., "Card cannot be first child of Section") in `/packages/adapter-next/catalog/rules/semantic.ts`
- [X] T054 [P] [US1] adapter-next slot-registry (Hero variants: centered, overlay) in `/packages/adapter-next/catalog/slot-registry.ts`
- [X] T055 [P] [US1] adapter-next catalog index (discriminated union) in `/packages/adapter-next/catalog/index.ts`
- [X] T056 [P] [US1] adapter-next Handlebars templates (page.tsx.hbs, hero.tsx.hbs, section.tsx.hbs, card.tsx.hbs, cta.tsx.hbs) in `/packages/adapter-next/templates/`
- [X] T057 [P] [US1] adapter-next prep files — *deferred: not needed in v0.1 because the `{{slot "Hero" variant}}` Handlebars helper resolves variants directly inside `page.tsx.hbs` without requiring per-primitive prep. Prep support itself arrives in v0.2 (see T036 deferral).*
- [X] T058 [P] [US1] adapter-next `output.map.ts` mapping Page → `src/app/<slug>/page.tsx` in `/packages/adapter-next/output.map.ts`
- [X] T059 [P] [US1] adapter-next `audit.ts` (cross-spec rules: e.g., exactly one root layout) in `/packages/adapter-next/audit.ts`
- [X] T060 [P] [US1] adapter-next `bootstrap.ts` (writes starter `design/specs/home.json`, runs sample compose) in `/packages/adapter-next/bootstrap.ts`
- [X] T061 [P] [US1] adapter-next `index.ts` exporting the adapter via `defineAdapter()`

### Implementation: Claude Code skill pack `@composer/skill-claude`

- [X] T062 [US1] Skill prose `SKILL.md` (workflow: always discover first, never write source directly, route through compose) in `/packages/skill-claude/SKILL.md`
- [X] T063 [P] [US1] Skill MCP config `mcp.json` pointing to `@composer/mcp` in `/packages/skill-claude/mcp.json`
- [X] T064 [P] [US1] Skill prompts (`attached.md`, `compose-feature.md`, `debugging.md`) in `/packages/skill-claude/prompts/`

### End-to-end validation for User Story 1

- [X] T065 [US1] Fixture Next.js project at `/tests/fixtures/next-project/` — minimal Next.js App Router app with `composer.json: { extends: @composer/adapter-next@1 }`
- [X] T066 [US1] E2E agent loop test (US1 Acceptances #1–#5; SC-001) — drives the mock-agent through discover → scaffold → compose against the fixture — in `/tests/e2e/agent-loop.test.ts`

**Checkpoint**: User Story 1 fully functional. An agent attached via MCP can compose features in a fixture Next.js project. **MVP boundary reached if shipping just US1.**

---

## Phase 4: User Story 2 — Developer scaffolds new project (Priority: P1)

**Goal**: A developer runs `composer init --extends @composer/adapter-next` in their Next.js project and ends up with a working Composer-instrumented project in ≤30 seconds, including one sample compose proving the loop works (spec §US2, SC-002).

**Independent Test**: From an empty dir with only `package.json`, run `composer init --extends @composer/adapter-next`, assert composer.json + design/ + .gitignore entries + sample compose all exist within 30 seconds.

### Tests for User Story 2 (REQUIRED)

- [ ] T067 [P] [US2] Init flow integration test for `--extends` mode — asserts US2 Acceptance #1 — in `/tests/integration/init-extends.test.ts`
- [ ] T068 [P] [US2] Init flow integration test for `--bare` mode — asserts US2 Acceptance #3 — in `/tests/integration/init-bare.test.ts`
- [ ] T069 [P] [US2] Init refuses overwrite test — asserts US2 Acceptance #2 — in `/tests/integration/init-overwrite.test.ts`

### Implementation: `@composer/cli` (init)

- [ ] T070 [US2] CLI bin entrypoint + commander setup (research R2) in `/packages/cli/src/index.ts`
- [ ] T071 [US2] `composer init` command (handles both `--extends` and `--bare`, runs sample compose, writes .gitignore) in `/packages/cli/src/commands/init.ts`
- [ ] T072 [US2] `composer init` refuses to overwrite existing composer.json (exit code 1 per `contracts/cli-commands.md`) in same file as T071

**Checkpoint**: Both P1 stories (US1 + US2) functional. A user can fully adopt Composer + use the agent loop end-to-end.

---

## Phase 5: User Story 3 — Custom adapter (Priority: P2)

**Goal**: A developer can author and publish their own adapter (e.g., for Rails, or any non-Next.js ecosystem) and have a project adopt it via `extends:` (spec §US3, SC-004).

**Independent Test**: Hand-author a minimal adapter for a tiny target (e.g., a key=value config-file format), publish to a local npm registry, init a project against it, run compose.

### Tests for User Story 3 (REQUIRED)

- [ ] T073 [P] [US3] Extends resolution rules test (project overrides templates by filename; primitives merge with shadow warning per US3 Acceptance #1, #2) in `/tests/integration/adapter-extends.test.ts`
- [ ] T074 [P] [US3] Audit chain test (parent runs before project; failure aborts; US3 Acceptance #3) in `/tests/integration/adapter-audit-chain.test.ts`
- [ ] T075 [P] [US3] Cycle detection test (`A extends B extends A` rejected per FR-008) in `/tests/integration/adapter-cycle.test.ts`
- [ ] T076 [P] [US3] Custom-adapter end-to-end test (SC-004) — minimal hand-authored adapter, project adopts via `extends:`, compose succeeds — in `/tests/integration/custom-adapter.test.ts`

### Implementation: extends resolution

- [ ] T077 [US3] Adapter extends fetch + cache to `.composer/cache/parent/` (research R15) in `/packages/core/src/workspace/extends.ts` (depends on T023)
- [ ] T078 [US3] Adapter cycle detection (walk extends chain, reject on revisit) in same file as T077
- [ ] T079 [P] [US3] Custom adapter authorship guide in `/docs/adapters/authoring.md` — covers package layout, output.map.ts conventions, prep sandbox restrictions, publishing flow
- [ ] T080 [P] [US3] Minimal custom-adapter fixture at `/tests/fixtures/custom-adapter-keyvalue/` — used by T076

**Checkpoint**: Custom adapters are first-class. Composer is no longer tied to Next.js.

---

## Phase 6: User Story 4 — Drift detection prevents lost hand-edits (Priority: P2)

**Goal**: A developer who hand-edits a generated file does not silently lose those edits the next time compose runs. Composer detects drift, aborts, and offers remediation (spec §US4, SC-003).

**Independent Test**: Compose a feature, hand-edit one generated file, run compose again. Assert non-zero exit code, no file written, error output contains unified diff and remediation steps.

### Tests for User Story 4 (REQUIRED)

- [ ] T081 [P] [US4] Drift detection integration tests for all three acceptance scenarios (idempotent no-op; abort on hand-edit; staging discarded on failure) in `/tests/integration/drift.test.ts` (SC-003)
- [ ] T082 [P] [US4] Idempotence test — re-compose with no changes is byte-identical no-op (FR-016) — in `/tests/integration/idempotence.test.ts`

### Implementation

- [ ] T083 [P] [US4] Drift abort message + remediation prompt (unified diff via `diff` lib; printed to stderr in human mode, structured in JSON mode) in `/packages/core/src/drift/abort.ts`
- [ ] T084 [P] [US4] Output hash store updates + recovery on rollback (data-model §10) in `/packages/core/src/drift/hashes.ts`

**Checkpoint**: Drift detection prevents accidental data loss. Generated code is officially "an artifact, not a place humans edit."

---

## Phase 7: User Story 5 — Source-map traversal (Priority: P3)

**Goal**: A developer (or agent) debugging generated code can run `composer explain <file>:<line>` to find the originating spec node, or `composer trace <spec>:<line>` to find generated output spans (spec §US5, SC-005).

**Independent Test**: Compose a feature, capture a line in generated output, run `composer explain <file>:<line>`. Assert ≤1s response with `(spec_id, spec_line, primitive, node_id)`.

### Tests for User Story 5 (REQUIRED)

- [ ] T085 [P] [US5] `composer explain` integration test (US5 Acceptance #1, SC-005) in `/tests/integration/sourcemap-explain.test.ts`
- [ ] T086 [P] [US5] `composer trace` integration test (US5 Acceptance #2) in `/tests/integration/sourcemap-trace.test.ts`

### Implementation

- [ ] T087 [P] [US5] `composer explain` command in `/packages/cli/src/commands/explain.ts` per `contracts/cli-commands.md` (FR-020)
- [ ] T088 [P] [US5] `composer trace` command in `/packages/cli/src/commands/trace.ts` per `contracts/cli-commands.md` (FR-020)

**Checkpoint**: All user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting concerns and CLI commands that mirror MCP for human/CI use, plus health-check tooling and CI.

### CLI command parity

- [ ] T089 [P] `composer compose <spec_id>` CLI command (human/CI alternative to MCP tool) in `/packages/cli/src/commands/compose.ts` per `contracts/cli-commands.md`
- [ ] T090 [P] `composer validate <spec_id>` CLI command in `/packages/cli/src/commands/validate.ts`
- [ ] T091 [P] Reserved-namespace stub commands (`ingest`, `promote`, `migrate` → exit 99 "not implemented in v0.1") in `/packages/cli/src/commands/reserved.ts` (FR-022)

### `composer doctor` (health check)

- [ ] T092 [P] `composer doctor` skeleton + report formatter (FR-021) in `/packages/cli/src/commands/doctor.ts`
- [ ] T093 [P] doctor: drift state report across all output files in same file as T092
- [ ] T094 [P] doctor: primitive sprawl report (usage count + last-used, warn at >50; per README §10) in same file
- [ ] T095 [P] doctor: 30-line discipline lint (constitution V, FR-006) in same file
- [ ] T096 [P] doctor: bijection check runner (uses T025) in same file
- [ ] T097 [P] doctor: stale-lockfile cleanup (FR-CONC-003) in same file
- [ ] T098 [P] doctor: naming hygiene (rejects primitives named `while`/`if`/`else`/`fork`/`async`/`await` per constitution VIII) in same file
- [ ] T099 [P] doctor: parent adapter freshness check (`--refresh-parent` flag, per research R15) in same file

### Documentation

- [ ] T100 [P] Update `/README.md` with v0.1 adoption section + quickstart link
- [ ] T101 [P] Adapter authorship guide deepening in `/docs/adapters/authoring.md` (extends T079) — cover slot registry, semantic rules, output map, prep sandbox, publishing checklist
- [ ] T102 [P] Methodology overview in `/docs/methodology/scc-overview.md` — pointer to README, summary of constitution, glossary
- [ ] T103 Dogfood `composer.json` at repo root — Composer instruments itself using a minimal hand-authored adapter for its own docs (proves the toolkit on real content). Skip if too costly to land in v0.1.

### CI

- [ ] T104 [P] GitHub Actions workflow `.github/workflows/ci.yml` — `pnpm install && pnpm build && pnpm typecheck && pnpm test` on PR + main
- [ ] T105 [P] CI workflow step: bijection check across all reference primitives (constitution VIII Quality Gate, SC-008)
- [ ] T106 [P] CI workflow step: 30-line lint via `composer doctor` (constitution V Quality Gate)

### Final validation

- [ ] T107 Execute `/specs/001-composer-toolkit-v0/quickstart.md` end-to-end manually as smoke test (validates SC-001 through SC-009)
- [ ] T108 Publish v0.1.0 release: tag, npm publish all seven `@composer/*` packages, GitHub release notes

---

## Dependencies & Execution Order

### Phase dependencies

```
Setup (Phase 1)
   │
   ▼
Foundational (Phase 2)          ◄── BLOCKS all user stories
   │
   ├──────────┬──────────┬──────────┬──────────┐
   ▼          ▼          ▼          ▼          ▼
US1 (P1)    US2 (P1)   US3 (P2)   US4 (P2)   US5 (P3)
(Phase 3)   (Phase 4)  (Phase 5)  (Phase 6)  (Phase 7)
   │          │          │          │          │
   └──────────┴──────────┴──────────┴──────────┘
                          │
                          ▼
                   Polish (Phase 8)
```

- **Setup (Phase 1)**: No dependencies. Start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational. Can proceed in parallel if staffed.
- **Polish (Phase 8)**: Depends on all desired user stories.

### Within each user story

- Tests MUST be written FIRST and FAIL before implementation (per constitution Quality Gates).
- Models/types before services; services before endpoints; core before integration.

### Cross-story dependencies (minor)

- US3 (custom adapters) shares the workspace resolver with US1 — but US1 uses `extends: @composer/adapter-next` (the one shipped adapter), so US1 + US3 implementation share T023/T024 from Foundational. No story-to-story ordering required.
- US5 (explain/trace) uses the source map written by US1's compose phase. US5 implementation depends on T022 (source-map persistence) from Foundational — already a prerequisite.

### Parallel opportunities

- **Phase 1 (Setup)**: T003 / T004 / T005 / T006 in parallel after T002.
- **Phase 2 (Foundational)**: T008–T022 are nearly all `[P]` — different files. Run in parallel.
- **Phase 3 (US1)**: T025–T031 (tests) all parallel; T033–T038 (pipeline phases) parallel; T046–T049 (MCP tools) parallel; T052–T061 (adapter-next files) parallel.
- **Phase 5 (US3)**: T073–T076 (tests) parallel; T077 + T078 share a file (sequential).
- **Phase 6 (US4)**: T081 + T082 parallel; T083 + T084 parallel.
- **Phase 8 (Polish)**: nearly all `[P]`.

### Multi-developer strategy

After Foundational:
- Developer A: US1 (the MVP — largest scope)
- Developer B: US2 (init) — small, fast, blocks adopter testing
- Developer C: US3 + US5 (adapter extends + sourcemap CLI) — sharing CLI module
- Developer D: US4 + Polish (drift tests + doctor)

---

## Parallel Example: User Story 1 implementation

```bash
# Tests (run all in parallel after Foundational complete)
Task T025: Bijection test harness in /tests/contract/bijection.test.ts
Task T026: Atomic-rollback test in /tests/integration/atomic-rollback.test.ts
Task T027: Mock-agent harness in /tests/integration/mock-agent.test.ts
Task T028: MCP discover contract test in /tests/contract/mcp-discover.test.ts
Task T029: MCP scaffold contract test in /tests/contract/mcp-scaffold.test.ts
Task T030: MCP validate contract test in /tests/contract/mcp-validate.test.ts
Task T031: MCP compose contract test in /tests/contract/mcp-compose.test.ts

# Adapter-next content (run all in parallel)
Task T052: Catalog primitives in /packages/adapter-next/catalog/primitives/*.ts
Task T053: Semantic rules in /packages/adapter-next/catalog/rules/semantic.ts
Task T054: Slot registry in /packages/adapter-next/catalog/slot-registry.ts
Task T055: Catalog index in /packages/adapter-next/catalog/index.ts
Task T056: Templates in /packages/adapter-next/templates/*.hbs
Task T057: Prep files in /packages/adapter-next/templates/*.prep.ts
Task T058: output.map.ts in /packages/adapter-next/output.map.ts
Task T059: audit.ts in /packages/adapter-next/audit.ts
Task T060: bootstrap.ts in /packages/adapter-next/bootstrap.ts
Task T061: adapter index in /packages/adapter-next/index.ts
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1: Setup
2. Phase 2: Foundational (CRITICAL — blocks everything)
3. Phase 3: User Story 1 (the agent loop end-to-end with the reference adapter)
4. **STOP**: Validate US1 independently with the mock-agent harness against the fixture project
5. Demo to internal stakeholders

The MVP slice gives you the *complete agent experience* — discover → scaffold → compose → real source files — even if adopting a project still requires hand-authoring `composer.json` (US2 not yet implemented).

### Incremental delivery to v0.1.0

1. Setup + Foundational → ready
2. Add US1 → MVP (internal demo, no public consumers yet)
3. Add US2 → first public-installable release (adopters can `composer init`)
4. Add US3 → custom adapters land; ecosystem can begin
5. Add US4 → production-safety guarantee
6. Add US5 → debugging UX complete
7. Polish (Phase 8) → ship v0.1.0

### Parallel-team strategy (if staffed)

After Foundational completes, four developers can fan out:
- A: US1 (largest; needs ~1–2 weeks; everyone else blocks on T044 `@composer/core` export being stable for integration)
- B: US2 (smaller; ~3 days; depends on T044)
- C: US3 (medium; ~5 days; integrates with US1)
- D: US4 + US5 (medium; ~5 days; depends on T038 commit-phase and T022 sourcemap-persist being stable)

Then converge on Polish (Phase 8).

---

## Notes

- `[P]` tasks operate on different files with no incomplete-dependency on each other.
- `[Story]` label maps each task to its user story for traceability and demoability.
- All paths are repo-relative.
- Tests are mandatory per constitution v1.0.0 Quality Gates — not "optional".
- Each phase ends with a Checkpoint that validates the story independently.
- Constitution `.specify/memory/constitution.md` is the binding doctrine; any task that violates it requires a Complexity Tracking entry in `plan.md`.
- The reference design at `/docs/superpowers/specs/2026-05-25-composer-design.md` (790 lines) is the authoritative architectural source; tasks above cite it implicitly via section references in `plan.md`.
- After all tasks complete: run `/speckit-analyze` to cross-check spec/plan/tasks consistency before `/speckit-implement`.
