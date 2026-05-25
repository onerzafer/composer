# Feature Specification: Composer Toolkit v0.1

**Feature Branch**: `001-composer-toolkit-v0`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "Composer v0.1 — Schema-Compiled Composition toolkit. Core engine library, MCP server, CLI, TypeScript catalog-authoring engine, Next.js reference adapter, Claude Code skill pack. Lets any LLM coding agent attach to a project and execute the `discover → scaffold → [validate?] → compose` loop. Output: hand-quality source code in any target language, emitted from human-authored Handlebars templates."

**Reference design document**: `/docs/superpowers/specs/2026-05-25-composer-design.md` (790 lines)

**Reference methodology document**: `/README.md` (Schema-Compiled Composition, 388 lines)

---

## Clarifications

### Session 2026-05-25

- Q: How should Composer capture compose-time diagnostics and where? → A: Structured JSON only — one file per compose invocation at `.composer/logs/<timestamp>-<spec_id>.json`; stderr emits only a success/failure summary line.
- Q: What is the trust model for adapters loaded via `extends:` (their `rules/`, `audit.ts`, `bootstrap.ts`, `*.prep.ts` execute on the developer's machine and inside compose)? → A: Ordinary npm dependencies — no additional verification, no allowlist, no signing. Trust is delegated to the project's existing npm supply-chain controls. Risk documented for adopters; signing/allowlist deferred to v1+.
- Q: How is concurrent `compose` execution prevented (e.g., MCP-attached agent and CLI human running compose simultaneously)? → A: Whole-workspace lockfile at `.composer/cache/compose.lock` (PID + ISO timestamp). Stale-PID detection reclaims abandoned locks. One compose at a time per workspace. Per-spec parallelism deferred to v1.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Agent composes a feature against a Composer-instrumented project (Priority: P1)

A coding agent (Claude Code, attached to a Composer-instrumented Next.js project) is asked by its user to build a pricing page. The agent calls Composer's MCP `discover` to learn the project's catalog and design tokens, then `scaffold` to get a skeleton + full schema for the right primitive, then `compose` to atomically validate, persist the JSON spec, and emit the generated TSX files.

**Why this priority**: This is the *only* product use case in v0.1. Everything else (init, custom adapters, doctor, explain) is in service of making this loop work cleanly. Without this, Composer has no reason to exist.

**Independent Test**: Wire up a fresh fixture Next.js project with the `@composer/adapter-next` extends, attach a mock MCP client implementing the agent role, and run the full `discover → scaffold → compose` sequence. Assert that the spec file lands in `design/specs/`, the generated `.tsx` files land in `src/`, and the output type-checks under the fixture's tsconfig.

**Acceptance Scenarios**:

1. **Given** a Next.js project with `composer.json: { workspace: "./design", extends: "@composer/adapter-next@1" }` and no existing specs, **When** the agent calls `discover()`, **Then** the response includes the project's catalog primitives (names + intents + when-to-use, no schemas), an empty specs list, the project guidelines, and the design tokens — total response under 5,000 tokens.

2. **Given** the agent has received `discover()` output and selects the `Hero` primitive, **When** the agent calls `scaffold({ kind: "primitive", primitive: "Hero", intent: "centered hero for pricing page" })`, **Then** the response includes a starter JSON skeleton with placeholders, the full Zod-as-JSON schema for Hero, field guidance per field, the `whenNotToUse` list, and ≥1 canonical example.

3. **Given** the agent has composed JSON in its own context, **When** the agent calls `compose("pricing", json)` with a structurally + semantically valid composition, **Then** Composer writes `design/specs/pricing.json`, renders templates to a staging directory, drift-checks any preexisting outputs, atomic-renames staging into `src/app/pricing/page.tsx` (and any companion files), and returns the list of files written with their diffs.

4. **Given** the agent submits a composition that fails semantic validation (e.g., "Card cannot be first child of Section"), **When** Composer runs the validate phase of compose, **Then** no file is written, no spec is saved, and the response contains structured errors with `path`, `message`, and `suggestion` per error.

5. **Given** an existing spec at `design/specs/pricing.json`, **When** the agent calls `scaffold({ kind: "spec", spec_id: "pricing" })`, **Then** the response contains the full JSON content of that spec so the agent can edit it without an inspection escape hatch.

---

### User Story 2 — Developer scaffolds a new Composer-instrumented project (Priority: P1)

A developer starting a new (or already-existing) Next.js project wants to adopt Composer. They run `composer init --extends @composer/adapter-next` and end up with a working Composer-instrumented project: `composer.json` pinned to a stable adapter version, a populated `design/` workspace seeded from the adapter, gitignore entries for the engine cache, and one sample spec composed to prove the loop works end to end.

**Why this priority**: Without `init`, every project adopting Composer would need to hand-author `composer.json` + workspace skeleton + first primitives + first templates. That's a 30-minute onboarding tax per project. With `init`, it's 30 seconds.

**Independent Test**: From an empty directory with only `package.json`, run `composer init --extends @composer/adapter-next`. Assert that `composer.json`, `design/`, `.gitignore`, and a successful sample `compose()` output all exist within 30 seconds.

**Acceptance Scenarios**:

1. **Given** a directory containing only `package.json`, **When** the developer runs `composer init --extends @composer/adapter-next`, **Then** the command creates `composer.json`, seeds `design/` from the adapter, appends `.composer/cache/` and `.composer/logs/` to `.gitignore`, and runs one sample `compose` to demonstrate the loop end-to-end.

2. **Given** a directory where `composer.json` already exists, **When** the developer runs `composer init`, **Then** the command refuses to overwrite and exits non-zero with a clear message.

3. **Given** a developer who wants to build for a novel ecosystem without a reference adapter, **When** they run `composer init --bare`, **Then** the command creates `composer.json` with no `extends` field, a minimal `design/` skeleton containing one example primitive + template, and instructions for next steps.

---

### User Story 3 — Developer authors a custom adapter for a novel ecosystem (Priority: P2)

A developer wants Composer to drive Rails view generation. There's no published Rails adapter. They run `composer init --bare`, hand-author their catalog (Page, Form, Partial), templates (`page.html.erb.hbs`, `form.html.erb.hbs`), and `output.map.ts`. After dogfooding it in two projects, they package the `design/` directory as `@acme/composer-adapter-rails` and publish to npm. A third project adopts it via `extends: "@acme/composer-adapter-rails"`.

**Why this priority**: Custom adapters are the difference between "Composer is for Next.js shops" and "Composer is for anyone with bounded code-generation patterns." It must be a first-class authoring path, not a forked-engine hack.

**Independent Test**: Hand-author a minimal adapter for a tiny target ecosystem (e.g., a `key=value` config-file format), publish to a local npm registry, init a fresh project with `extends: "<local-adapter>"`, and run `compose` to assert the layering rules work.

**Acceptance Scenarios**:

1. **Given** a project with `composer.json: { extends: "<custom-adapter>", workspace: "./design" }` and a local override at `design/templates/page.html.erb.hbs`, **When** `compose` runs and emits output for a `Page` primitive, **Then** the project's local template is used (not the parent adapter's template of the same filename).

2. **Given** a project that declares `Hero` in its local `design/catalog/primitives/hero.ts` while the parent adapter also declares `Hero`, **When** `composer doctor` runs, **Then** the report flags the shadowing with a warning identifying which definition wins.

3. **Given** a custom adapter declares additional semantic rules in `audit.ts`, **When** the project's own `audit.ts` also exists, **Then** both audit functions run during `compose` (parent first, project second), and any failure from either aborts the transaction.

---

### User Story 4 — Drift detection prevents accidental loss of hand-edits (Priority: P2)

A developer notices that the agent's last `compose` produced ugly output. They open `src/app/pricing/page.tsx` and edit the JSX directly to make it nicer. Later, the agent runs `compose("pricing", ...)` again. Composer detects the hand-edit, aborts the operation without writing anything, and tells the developer their hand-edit would be overwritten — pointing to specific lines and offering two remediation options.

**Why this priority**: Without drift detection, the user's hand-tweaks would be silently overwritten on every regeneration. That's the single biggest reason teams abandon codegen architectures (README §10 failure mode #4). With drift detection, generated code becomes safely re-runnable.

**Independent Test**: Compose a feature, hand-edit one of its generated files, run compose again with no spec changes. Assert that the second compose aborts with a non-zero exit code, no file is written, and the error output includes the unified diff of the hand-edit and remediation steps.

**Acceptance Scenarios**:

1. **Given** a generated file `src/app/page.tsx` whose content matches its recorded hash, **When** compose runs again with the same spec, **Then** no write occurs (idempotent no-op) and the response reports zero changes.

2. **Given** a generated file `src/app/page.tsx` that has been hand-edited (hash no longer matches), **When** compose runs, **Then** compose aborts with an error containing: the offending file path, a unified diff of the hand-edit vs. the regenerated content, and remediation options (revert via git, or lift the change into the spec/template and re-run).

3. **Given** any failure during compose's drift-check, write, or audit phases, **When** the error fires, **Then** no spec file is saved, no source file is touched, and the workspace + output tree are byte-identical to their pre-compose state.

---

### User Story 5 — Developer debugs generated code via source-map traversal (Priority: P3)

A developer sees a runtime error in `src/app/pricing/page.tsx` at line 42. They run `composer explain src/app/pricing/page.tsx:42` and immediately see which spec node, primitive, and template produced that line. They can then either fix the spec (if data is wrong), the template (if rendering is wrong), or the catalog (if the primitive itself is structurally wrong).

**Why this priority**: Debuggability is the unsung killer of codegen architectures. Without bi-directional source maps, generated code is opaque — a stack trace at a generated line tells you *what* broke but not *how it got there*. With explain/trace, the path back to the spec is a single command.

**Independent Test**: Compose a feature, capture a line in the generated output, run `composer explain <file>:<line>`. Assert the output identifies the originating `spec_id`, `spec_line`, `primitive`, and `node_id` in under 1 second.

**Acceptance Scenarios**:

1. **Given** a successful compose has written `src/app/pricing/page.tsx`, **When** the developer runs `composer explain src/app/pricing/page.tsx:42`, **Then** the command returns `{ spec_id, spec_line, primitive, node_id }` corresponding to the JSON node that produced line 42.

2. **Given** a spec at `design/specs/pricing.json`, **When** the developer runs `composer trace design/specs/pricing.json:12`, **Then** the command returns the list of `(file, line)` pairs in the generated output that originate from JSON line 12.

---

### Edge Cases

- **Concurrent compose calls** (any spec_id, any surface — MCP or CLI): serialized via a whole-workspace lockfile at `.composer/cache/compose.lock` containing PID + ISO timestamp. Second caller aborts immediately with `compose in progress (pid X, started Y)`. If the recorded PID is no longer alive, the lock is treated as stale and reclaimed. Released on normal completion or any error path. No queuing — second callers must retry. Per-spec parallelism is out of scope for v0.1.
- **Compose where staging-dir write succeeds but atomic-rename fails** (e.g., target file locked by another process): staging dir is discarded, original outputs untouched, error reports the OS-level cause.
- **Parent adapter unreachable from npm** during `compose` (offline, registry down): error includes the version pin from `composer.json` and instructions to use the cached copy under `.composer/cache/parent/`. If no cache, abort with a clear message.
- **Extends chain forms a cycle** (`A extends B extends A`): detection mandatory; abort init/compose with the chain printed.
- **Template prep throws an exception**: treated as a compose failure (atomic rollback). Error includes prep file path, stack trace, and the offending node JSON.
- **Spec ID contains path separators** (e.g., `compose("foo/../bar", ...)`): rejected at validate; spec IDs must match a strict whitelist (`[a-zA-Z0-9_-]+`).
- **Generated file falls outside the project root** (e.g., adapter output map points to `/etc/passwd`): rejected at output-map validation, before any write.
- **Workspace folder missing or unreadable**: rejected at workspace resolution (pipeline step 1), with a clear message and pointer to `composer init`.
- **Catalog has zero primitives**: discover succeeds (empty primitives array), scaffold rejects with "no primitives available", compose rejects with structural error.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Agent-facing surface

- **FR-001**: System MUST expose a workflow-only MCP surface comprising exactly four tools — `discover`, `scaffold`, `validate` (optional), `compose`. No tool that returns a single primitive's schema independently of `scaffold`. No tool that lists or reads templates. No tool that lists specs independently of `discover`.

- **FR-002**: `scaffold` MUST serve double duty — given a primitive name, returns schema + skeleton + examples; given an existing `spec_id`, returns the full content of that spec. This is the agent's only read endpoint into the catalog or workspace.

- **FR-003**: `compose` MUST be atomic. Structural validation, semantic validation, audit, staging-dir render, drift check, spec persistence, and atomic-rename of output files together form a single transaction. Failure at any step leaves the workspace + outputs byte-identical to pre-compose state.

- **FR-004**: `validate` MUST be side-effect-free. It returns the same error structure compose would return, plus a `would_write` diff list, but performs no persistence and no output emission.

#### Project model

- **FR-005**: System MUST locate the project's workspace via a `composer.json` file at the project root. `composer.json` declares `workspace` (path), `engine` (pinned catalog-authoring engine package), and optional `extends` (parent adapter package).

- **FR-006**: System MUST support optional inheritance from a published adapter via `extends`. When set, the parent adapter's content is loaded first and the project's workspace content is layered on top. When unset, the workspace is fully self-contained.

- **FR-007**: System MUST apply documented resolution rules when layering parent + project: templates override by filename, catalog primitives merge additively (with warned shadowing), audits run in sequence (parent first), output.map overrides wholesale.

- **FR-008**: System MUST detect cycles in the `extends` chain and abort with the chain printed.

#### Catalog & templates

- **FR-009**: System MUST validate JSON specs against a TypeScript/Zod catalog including a `z.discriminatedUnion("primitive", [...])` index and per-primitive `superRefine` semantic rules.

- **FR-010**: System MUST support per-primitive Handlebars templates (filename pattern `<name>.<output-ext>.hbs`) with an optional `<name>.prep.ts` for non-trivial data shaping.

- **FR-011**: System MUST sandbox template prep execution: no filesystem access, no network access, no dynamic eval. Prep runs in a restricted context exposing only the node, slot registry, design tokens, and Composer-provided helpers.

- **FR-012**: System MUST emit output files at adapter-declared paths regardless of target language; the template filename's pre-`.hbs` extension determines the output language.

#### Output policy

- **FR-013**: System MUST emit every generated file with a `DO NOT EDIT` banner referencing the source spec and the `composer explain` command.

- **FR-014**: System MUST emit per-block source-map comments (`// from: <spec-path>:<line> (<primitive>, id=<node_id>)`) above each top-level rendered block.

- **FR-015**: Before any overwrite, system MUST hash existing output files and compare against a previous-generation hash record. Mismatch MUST abort compose with a unified diff and remediation options.

- **FR-016**: System MUST treat compose as idempotent when no inputs have changed: same spec + same catalog + same templates + matching hashes → no write, no-op.

- **FR-017**: System MUST persist accepted specs in the workspace under a conventional location (default `design/specs/<spec_id>.json`); adapters MAY override the location via `output.map`.

- **FR-018**: System MUST persist a bi-directional source map (`design/.composer/cache/sourcemap.json`) updated atomically alongside output emission.

#### CLI

- **FR-019**: Users MUST be able to scaffold a new Composer project via `composer init` with two modes: `--extends <pkg>` (adopt a published adapter) and `--bare` (no parent adapter).

- **FR-020**: Users MUST be able to query the source map via `composer explain <file>:<line>` (code → spec) and `composer trace <spec>:<line>` (spec → code).

- **FR-021**: Users MUST be able to run a health-check via `composer doctor` reporting: drift state, primitive usage counts, unused primitives, template+prep line counts (30-line discipline), and parent adapter version status.

- **FR-022**: System MUST reserve the CLI namespace for `composer ingest`, `composer promote`, and `composer migrate` (deferred features). No v0.1 implementation; namespace claimed.

#### Engine ignoring

- **FR-023**: System MUST treat `design/catalog/ingested/` as engine-ignored. Files there are not loaded into the catalog, do not affect discover output, and do not participate in compose. Reserved for future brownfield ingestion.

#### Concurrency

- **FR-CONC-001**: System MUST acquire a whole-workspace lock at `.composer/cache/compose.lock` (containing the current PID + ISO 8601 start timestamp) at the beginning of every `compose` invocation and release it on completion or any error path.
- **FR-CONC-002**: If `compose.lock` already exists AND the recorded PID is currently alive, system MUST abort immediately with the lock-holder's PID and start time. No queuing, no waiting.
- **FR-CONC-003**: If `compose.lock` exists AND the recorded PID is no longer alive (stale lock), system MUST reclaim the lock and proceed.
- **FR-CONC-004**: `validate` (preview) MUST NOT acquire the compose lock. Validate is read-only and may run concurrently with compose.

#### Security & trust

- **FR-SEC-001**: System MUST load adapter code (rules, audit, bootstrap, prep) via standard Node module resolution from `node_modules/`. No additional verification (signing, hashing, allowlist) is performed in v0.1.
- **FR-SEC-002**: System MUST continue to sandbox template `*.prep.ts` execution per FR-011 / FR-017 regardless of whether the prep comes from the project workspace or the parent adapter. (The prep sandbox is the security boundary; adapter trust is not.)
- **FR-SEC-003**: Documentation for `composer init --extends <pkg>` MUST warn that adopting an adapter executes code from that package on the user's machine — same trust posture as any other npm dependency.

#### Observability

- **FR-OBS-001**: System MUST write one structured JSON log per `compose` invocation at `.composer/logs/<timestamp>-<spec_id>.json`. Log includes: invocation metadata (timestamp, spec_id, engine version, adapter version), each pipeline step with phase + duration + outcome, all validation errors, all files written/skipped/aborted, drift-check results, and final status.
- **FR-OBS-002**: System MUST emit ONLY a one-line success-or-failure summary to stderr on compose completion. Verbose human-readable streaming is out of scope for v0.1.
- **FR-OBS-003**: System MUST also write a structured log per `validate` invocation (dry-run preview) under the same `.composer/logs/` directory with naming `<timestamp>-<spec_id>-validate.json`.

#### Multi-agent attach

- **FR-024**: System MUST support multiple LLM agent platforms via per-platform skill packs (prose + MCP config) over a single shared MCP server binary. v0.1 ships `@composer/skill-claude` only; other platforms attach via the MCP server directly.

### Key Entities

- **Workspace**: The directory pointed to by `composer.json`'s `workspace` field. Contains catalog, templates, specs, output map, and the engine cache. May extend a parent adapter.

- **Catalog**: The set of primitives + semantic rules + slot registry + index defined under `<workspace>/catalog/`. Authored in TypeScript with Zod schemas.

- **Primitive**: One unit of the discriminated union. Declares schema, intent, whenToUse, whenNotToUse, fieldGuidance, examples. Owns one Handlebars template (and optionally one prep function).

- **Template**: A logic-less Handlebars file that lowers one primitive to one or more output files. Filename pattern declares output language.

- **Spec**: A JSON file representing one feature composition. Conforms to the discriminated-union schema. Written by the agent; persisted by `compose`; lowered to source files via templates.

- **Adapter**: Pre-packaged starter content (catalog + templates + output-map + audit + bootstrap) distributed as an npm package. May be official (`@composer/adapter-*`) or custom (`@<org>/composer-adapter-*`). Workspace may extend one adapter.

- **Source Map**: A bi-directional record mapping every line of generated output to its originating spec node, primitive, and template. Persisted under `.composer/cache/sourcemap.json`. Drives `explain` and `trace`.

- **Output Hash Record**: A snapshot of generated-file content hashes at last successful compose. Drives drift detection. Persisted under `.composer/cache/output.hashes.json`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A coding agent attached to a fresh Next.js project completes `discover → scaffold → compose` in ≤ 4 MCP calls and produces at least one type-checked source file. End-to-end wall-clock from attach to type-checked output ≤ 60 seconds on consumer hardware.

- **SC-002**: `composer init --extends @composer/adapter-next` produces a working Composer-instrumented project (composer.json, populated design/, .gitignore entries, one successful sample compose) in ≤ 30 seconds.

- **SC-003**: Drift detection catches 100% of generated-file hand-edits in integration tests; zero silent overwrites in any tested scenario.

- **SC-004**: A custom adapter published as an npm package is adoptable by a fresh project via `extends: "<pkg>"` with no additional configuration beyond `composer init`. Demonstrated on at least one non-Next.js fixture.

- **SC-005**: `composer explain <file>:<line>` returns the originating spec node (spec_id, spec_line, primitive, node_id) in ≤ 1 second on a project with ≤ 100 specs.

- **SC-006**: ≥ 90% of primitive templates in the reference adapter ship at ≤ 30 lines combined (template + prep). `composer doctor` flags any violation.

- **SC-007**: Atomic compose: on injected failure at every pipeline step (parse, semantic, audit, render, drift, persist), 100% of test runs leave the workspace + outputs byte-identical to pre-compose state.

- **SC-008**: Bijection: for every primitive in the reference adapter, `JSON → code → JSON` round-trips losslessly. Asserted in CI for every primitive.

- **SC-009**: The MCP server binary's `discover` response on the reference adapter fits in ≤ 5,000 tokens (light overview, no full schemas).

---

## Assumptions

- **Runtime**: Composer requires Node ≥ 20 LTS in v0.1. No browser runtime, no Deno, no Bun. The CLI binary ships via npm.

- **Adapter package**: The v0.1 reference adapter is `@composer/adapter-next` (Next.js App Router pages + forms). `@composer/adapter-hono` and `@composer/adapter-postgres` are v0.2 (out of scope for this spec).

- **Skill pack**: The v0.1 skill pack is `@composer/skill-claude` (Claude Code). Other agent platforms (Codex, Gemini CLI, Antigravity, OpenCode) attach to the MCP server without a dedicated skill in v0.1.

- **Spec layout**: Specs default to `design/specs/<spec_id>.json`. Adapters may override via `output.map`. The Next.js reference adapter uses this default.

- **Out of scope for v0.1** (deferred per design doc §4): LSP server, constrained-decoding integration, migration codemods, brownfield ingestion plugins, additional adapters beyond Next.js, additional skill packs beyond Claude Code, daemon mode, BNF/EBNF grammar export.

- **Constitution compliance**: This feature is bound by `/Users/oner/Projects/composer/.specify/memory/constitution.md` v1.0.0. All design choices in plan.md must justify any deviation.

- **Existing source design**: The 790-line design document at `/docs/superpowers/specs/2026-05-25-composer-design.md` is the source of architectural detail. plan.md will cite it section-by-section. spec.md (this file) is the outcome-and-behavior contract; design doc is the technical-detail reference.

- **Git repo state**: Project is already a git repo on branch `001-composer-toolkit-v0`, with `main` containing the README + design doc + .gitignore (commit `62b2d4a`). Spec-Kit scaffolding was added on this feature branch.

- **External dependencies**: Composer's runtime stack will include Zod (validation), Handlebars (templating), ts-morph or similar (catalog loading via TypeScript). Specific picks are finalized in plan.md.
