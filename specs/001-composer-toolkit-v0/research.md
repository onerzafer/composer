# Phase 0 Research — Composer Toolkit v0.1

**Inputs**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`/.specify/memory/constitution.md`](../../.specify/memory/constitution.md), [`/docs/superpowers/specs/2026-05-25-composer-design.md`](../../docs/superpowers/specs/2026-05-25-composer-design.md), [`/README.md`](../../README.md)

**Goal**: Resolve every NEEDS CLARIFICATION from Technical Context so Phase 1 (data-model, contracts, quickstart) can proceed unambiguously.

---

## R1. TypeScript catalog loader

**Decision**: `tsx` for runtime execution; `ts-morph` only if we need AST-walking (e.g., catalog introspection beyond Zod runtime). Default to tsx.

**Rationale**:
- The catalog files (`catalog/primitives/*.ts`, `catalog/rules/*.ts`, `catalog/index.ts`) export *values* (Zod schemas + metadata records). The engine consumes the runtime values; it does not need the syntactic AST.
- `tsx` is a drop-in Node loader that transpiles + executes TypeScript on-the-fly. Mature (4.x+), used in production by tens of thousands of projects, zero config.
- `ts-morph` is a high-level wrapper around the TypeScript compiler API. Powerful for AST analysis but ~10× heavier startup (loads the full TS compiler at import time). Reserve for `composer doctor` linting that needs to inspect catalog source structurally (e.g., 30-line LOC count — that we could also do with a simple regex/file-read).
- Native `typescript` compiler API: lower-level than ts-morph, similar startup cost. No advantage over tsx for runtime execution.

**Alternatives considered**:
- `ts-node` — predecessor of tsx, slower, less actively maintained.
- `swc-node` — fastest, but lacks some TS features Zod chains depend on (e.g., satisfies). Reconsider in v0.2 if startup is a bottleneck.
- Pre-build catalog via tsc to `dist/catalog/` and require the JS — adds a build step humans don't want in a toolkit that emphasizes "edit primitive → compose immediately."

**Implementation note**: `@composer/typescript` exports `loadCatalog(path) → Promise<CompiledCatalog>` that internally invokes tsx, parses `index.ts`'s discriminated union, and caches the compiled Zod schemas to `.composer/cache/catalog.compiled.json` keyed by source mtime.

---

## R2. CLI library

**Decision**: `commander` ^12.

**Rationale**:
- Most widely adopted Node CLI library. Long-term stable API, excellent TypeScript types.
- Subcommands map cleanly to FR-019 / FR-020 / FR-021 (`init`, `compose`, `validate`, `explain`, `trace`, `doctor`).
- Built-in help generation, no plugin system to wrangle. Good fit for a focused 6-command CLI.
- Reserved namespace (`ingest`, `promote`, `migrate`) is trivially added later.

**Alternatives considered**:
- `cac` — lighter, also good. Roughly equivalent feature set; commander wins on ecosystem familiarity.
- `oclif` — full framework. Overkill; adds plugin architecture and OCLIF-specific manifest we don't need.
- `yargs` — viable but more boilerplate per command than commander.

**Implementation note**: `@composer/cli` keeps each command in `src/commands/<verb>.ts` exporting a `register(program: Command)` function for testability.

---

## R3. Template prep sandbox

**Decision**: Node's built-in `vm` module with a restricted `globalThis` (no `process`, no `fs`, no `require`, no `import`). One `vm.Context` per compose invocation, populated only with the node, slot registry, design tokens, and Composer helper bindings.

**Rationale**:
- FR-011 + FR-017 require: no FS, no network, no eval. Node's `vm` provides isolated context creation that satisfies this; native primitive, zero dependencies.
- Performance: vm context creation is sub-millisecond; acceptable per-compose.
- Compatibility: `vm` ships with Node — no extra install, no version pinning concerns.

**Alternatives considered**:
- `vm2` — superior isolation but UNMAINTAINED (publicly archived 2024). Active CVEs. Hard No.
- `isolated-vm` — strong isolation via V8 isolates; native module, requires build toolchain. Overkill for prep that runs trusted-but-disciplined code from the project's own workspace + a vetted adapter.
- `worker_threads` — runs prep in a separate thread. Good isolation but adds IPC overhead per prep call (prep runs per node, of which there may be hundreds in a spec). Reject for performance.
- Out-of-process subprocess (`child_process.fork`) — even more overhead. Reject.

**Implementation note**: `@composer/core/src/render/sandbox.ts` exports `runPrep(prepFnSource, node, context) → Promise<RenderContext>`. The context exposes: `node`, `slotRegistry`, `tokens`, and a frozen `helpers` object (`json`, `kebab`, `slot`, `indent`).

---

## R4. Handlebars version

**Decision**: `handlebars` ^4.7 (current latest stable).

**Rationale**:
- Most widely used logic-less template engine for Node. Stable. No competing v5 in the foreseeable horizon.
- Logic-less by design: aligns with constitution principle V (30-line discipline) and the README's intent that templates be pure substitution.
- Built-in security: `compile(template, { noEscape: false })` HTML-escapes by default; we use `{{{ }}}` triple-stash explicitly for the `json` helper output.
- Helpers easily registered: we ship `json` / `kebab` / `slot` / `indent` from `@composer/core/src/render/helpers.ts`.

**Alternatives considered**:
- `mustache` — strictly logic-less, even more constrained. Doesn't support helpers, which we need for `slot` lookup. Reject.
- `eta` — fast, comparable feature set. Less ecosystem momentum. Equivalent for our needs; commander > cac analogy applies.
- `nunjucks` — Jinja-like, too permissive (allows arbitrary expressions). Violates constitution V.

---

## R5. MCP transport

**Decision**: stdio only in v0.1, via `@modelcontextprotocol/sdk/server/stdio`. HTTP transport deferred to v1+ behind an env-flag.

**Rationale**:
- Every target agent in v0.1 (Claude Code, Codex, Antigravity, Gemini CLI, OpenCode) supports stdio MCP. It is the lowest-common-denominator transport.
- Local-only by definition: no network exposure surface for v0.1.
- Spawn-on-attach: each agent attaches starts a fresh `npx @composer/mcp` process. Workspace lock (FR-CONC-001) handles cross-process serialization if multiple agents attach simultaneously.

**Alternatives considered**:
- HTTP — necessary only for remote-agent / web-IDE scenarios. Out of scope for v0.1.
- Unix domain socket — gains over stdio negligible for the local-only case.

---

## R6. Test runner

**Decision**: `vitest` ^2.

**Rationale**:
- Native TS, native ESM, fast watch mode, jest-compatible API. Already standard in modern Node-TS projects.
- Snapshot testing built-in (we need this for templates).
- Inline `expect` matchers reduce setup.

**Alternatives considered**:
- jest — slower TS toolchain, weaker ESM support, more boilerplate.
- node --test — minimalist, lacks snapshot support out of the box. Reject for first-class snapshot needs.

---

## R7. Package manager + monorepo

**Decision**: `pnpm` with workspaces.

**Rationale**:
- Faster than npm/yarn for monorepos via content-addressed store.
- Strict by default: prevents accidental dependency leakage between packages (good hygiene for a 7-package monorepo).
- `pnpm-workspace.yaml` is the simplest workspace declaration.

**Alternatives considered**:
- npm workspaces — works fine; pnpm just wins on speed and strictness.
- yarn berry — feature-rich but heavier setup.
- Nx / Turbo — orchestration layer atop workspaces. Premature for v0.1; reconsider when CI matrix grows.

---

## R8. Performance target validation

**Decision**: Targets in spec SC-001 / SC-002 / SC-005 / SC-009 are realistic on consumer hardware; no architectural change needed.

**Rationale per target**:
- **SC-001 (≤60s end-to-end)**: Three MCP roundtrips + one compose. tsx catalog load ~200ms cold (cached after first run), Zod parse ~5ms per spec, Handlebars render ~1ms per template, type-check of one TSX file ~2s (Next.js). Aggregate: well under 60s; the dominant cost will be the agent's LLM latency, which is out of our control.
- **SC-002 (init ≤30s)**: `npx` adapter fetch + file copy + first compose. Dominant cost is npm fetch (~10s on first install). Cached after first init.
- **SC-005 (explain ≤1s, ≤100 specs)**: sourcemap.json fits in memory; binary search on (file, line) ranges is microsecond. Disk-read dominates: ~50ms for a 1MB JSON.
- **SC-009 (discover ≤5,000 tokens)**: With light overview (no schemas), 30 primitives × ~100 tokens each + project metadata = ~3,500 tokens. Comfortable margin.

**No bottlenecks anticipated for v0.1.** Daemon mode (cached catalog across calls) is the v1+ lever if multi-shot performance becomes a constraint.

---

## R9. Adapter package distribution mechanics

**Decision**: Adapters publish to npm as ordinary packages. `composer init --extends <pkg>` does `npm install <pkg>` (project's package manager) under the hood + copies starter files. Composer does not maintain a registry.

**Rationale**:
- FR-SEC-001 already specified: adapters are ordinary npm deps. Distribution follows.
- Avoids inventing infrastructure (curated registry, signing, allowlist) v0.1 has no need for.
- Custom adapter authors just `npm publish` — zero Composer-specific publishing flow.

**Alternatives considered**:
- Curated registry under composer.dev — premature; ecosystem demand should justify before building.
- GitHub-only distribution — works via npm's git+https specifier; no Composer-specific support needed.

---

## R10. Output file path safety

**Decision**: At workspace resolution (pipeline step 1d, plan.md §"Engine pipeline"), all paths declared in `output.map.ts` are normalized + canonicalized + checked against the project root. Any path that resolves outside the project root → reject before any write.

**Rationale**:
- Spec edge cases mention path-traversal protection. This is the implementation.
- Cheap: one `path.resolve(projectRoot, declared)` + `relative()` check at resolution time, not per-write.
- Failure mode: clear error pointing at the offending output.map entry.

**Alternatives considered**:
- Per-write check — same outcome, runs more often. Resolution-time check is sufficient.
- Allowlist of root-relative directories (e.g., only `src/`) — over-constrains adapters. Reject.

---

## R11. Drift hash algorithm

**Decision**: SHA-256 over file content (UTF-8 normalized to LF line endings). Stored in `.composer/cache/output.hashes.json` as `{ "<rel-path>": "<hex-hash>", ... }`.

**Rationale**:
- SHA-256 is cryptographically robust; negligible perf cost (< 10ms for typical files).
- LF normalization prevents false drift on Windows / mixed-CRLF environments.
- JSON storage is human-readable in git diffs (drift state is committable; humans can see what's "blessed").

**Alternatives considered**:
- xxhash64 — faster but non-cryptographic; risk of collision is theoretical but unnecessary downgrade.
- mtime + size — fragile across machines and git operations. Reject.
- Per-line hashing (more granular diffs) — overkill for v0.1; CLI diff already shows line-level on drift abort.

---

## R12. Source map format

**Decision**: Custom JSON at `.composer/cache/sourcemap.json` with shape:

```json
{
  "version": 1,
  "by_file": {
    "<rel-output-path>": [
      { "line_start": 12, "line_end": 28, "spec_id": "pricing", "spec_line": 7, "primitive": "Hero", "node_id": "pricing-hero" }
    ]
  },
  "by_spec": {
    "<spec_id>:<line>": [
      { "file": "<rel-output-path>", "line_start": 12, "line_end": 28 }
    ]
  }
}
```

**Rationale**:
- We are not generating JavaScript source maps (V3 format); we are mapping per-block code → spec lines. The V3 format doesn't fit (it's column-level for JS minification).
- Storing both directions explicitly means `composer explain` and `composer trace` are direct lookups, no recomputation.
- JSON keeps it inspectable + git-diffable.

**Alternatives considered**:
- TypeScript-native source maps — wrong abstraction; we map text-blocks, not statements.
- One-directional with computed inverse — saves disk but adds latency to `composer trace`. SC-005 requires ≤1s for explain; trace should match.

---

## R13. Spec ID validation

**Decision**: Spec IDs match `^[a-z0-9][a-z0-9-]{0,62}$` (lowercase alphanumeric + hyphens; starts with alphanumeric; 1–63 chars).

**Rationale**:
- Spec edge case forbade path separators. This regex is more restrictive and avoids any filename-quirk class.
- 63 chars matches POSIX max filename component minus extension.
- Lowercase-only avoids case-folding filesystem issues (macOS APFS is case-insensitive by default).
- Hyphens are intuitive for multi-word IDs.

**Alternatives considered**:
- Allow underscores too — fine, but hyphens are URL- and slug-friendly. Pick one.
- UUIDs as spec IDs — opaque to humans, breaks the agent's mental model where spec_id often correlates with feature name.

---

## R14. Logging structure

**Decision**: Each log file at `.composer/logs/<ISO-timestamp>-<spec_id>.json` (compose) or `<ISO-timestamp>-<spec_id>-validate.json` (validate) is a single JSON document with shape:

```json
{
  "version": 1,
  "invocation": { "timestamp", "surface": "mcp"|"cli", "engine_version", "adapter_version", "node_version", "pid" },
  "spec": { "id", "path", "hash" },
  "phases": [
    { "phase": "resolve-workspace", "duration_ms": 18, "outcome": "ok" },
    { "phase": "compile-catalog",    "duration_ms": 142, "outcome": "ok" },
    { "phase": "structural-validate", "duration_ms": 8, "outcome": "ok" },
    { "phase": "semantic-validate",   "duration_ms": 23, "outcome": "ok" },
    { "phase": "audit",               "duration_ms": 11, "outcome": "ok" },
    { "phase": "render-staging",      "duration_ms": 67, "outcome": "ok", "files": [ ... ] },
    { "phase": "drift-check",         "duration_ms": 14, "outcome": "ok" },
    { "phase": "atomic-rename",       "duration_ms": 9,  "outcome": "ok" }
  ],
  "errors": [],
  "files_written": [ { "path", "kind": "created"|"updated", "hash" } ],
  "status": "ok"
}
```

**Rationale**:
- One file per invocation (no log rotation needed; humans can grep + jq).
- Per-phase entries directly support SC-007 (atomic-rollback testing — assert which phase failed).
- `version: 1` field future-proofs format changes.

**Log retention**: not managed in v0.1. Users can clean `.composer/logs/` manually or via cron. `composer doctor` may report log dir size in v1+.

---

## R15. Adapter `extends` resolution caching

**Decision**: On `composer init --extends @composer/adapter-next`, the engine copies the adapter's `catalog/`, `templates/`, `output.map.ts`, `audit.ts` into `.composer/cache/parent/` (gitignored). Subsequent compose calls use the cached copy.

**Re-fetch**: on `composer doctor --refresh-parent` (CLI) or when `composer.json`'s `extends` version pin changes.

**Rationale**:
- Compose performance: no per-invocation npm or node_modules traversal for parent content.
- Offline-safe: once cached, project composes without network.
- Predictable: parent updates require explicit refresh; no surprise drift from upstream.

**Alternatives considered**:
- Live read from `node_modules/<adapter>/` per compose — fragile (node_modules pruning, hoisting variations) and slower.
- Cache invalidation by mtime — works but version pin is more semantic.

---

## Summary

All 15 unknowns from `plan.md`'s Technical Context are now resolved. Phase 1 (data-model, contracts, quickstart) proceeds with these as fixed inputs. No `NEEDS CLARIFICATION` markers remain.
