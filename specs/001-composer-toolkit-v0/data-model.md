# Phase 1 — Data Model

**Inputs**: [`spec.md`](./spec.md), [`research.md`](./research.md)

This document defines the entities the engine manipulates at runtime, their attributes, relationships, validation rules, and lifecycle transitions. Each entity maps to one or more TypeScript types in `@composer/core`.

---

## Entity overview

```
┌──────────────────┐  reads          ┌──────────────────┐
│ ComposerConfig   │ ───────────────▶│ Workspace        │
│ (composer.json)  │                 │                  │
└──────────────────┘                 └─────┬────────────┘
        │                                  │ contains
        │ extends?                         │
        ▼                                  ▼
┌──────────────────┐  merges into    ┌──────────────────┐
│ Adapter          │ ───────────────▶│ Catalog          │ ───┐
│ (npm package)    │                 │ (Primitives,     │    │
└──────────────────┘                 │  Rules,          │    │
                                     │  SlotRegistry,   │    │
                                     │  OutputMap)      │    │
                                     └──────┬───────────┘    │
                                            │                │
                                            │ validates      │
                                            ▼                │ renders via
                                     ┌──────────────────┐    │
                                     │ Spec             │    │
                                     │ (JSON instance)  │    │
                                     └──────┬───────────┘    │
                                            │ compose ─────  │
                                            ▼                ▼
                                     ┌──────────────────────────┐
                                     │ GeneratedFile            │
                                     │   tracked by:            │
                                     │     OutputHashRecord     │
                                     │     SourceMap            │
                                     └──────────────────────────┘
```

---

## 1. `ComposerConfig`

The pointer file at the project root (`composer.json`).

| Field | Type | Required | Notes |
|---|---|---|---|
| `workspace` | string (path) | yes | Path to workspace folder, relative to composer.json |
| `engine` | string | yes | Pinned engine package + version, e.g., `"@composer/typescript@1"` |
| `extends` | string \| null | no | Pinned parent adapter package + version, e.g., `"@composer/adapter-next@1"` |

**Validation**:
- `workspace` resolves to an existing directory under the project root (FR-005, R10)
- `engine` matches one of the supported engines (v0.1: only `@composer/typescript@<MAJOR>`)
- `extends` (if present) resolves via npm to a valid Adapter package

---

## 2. `Workspace`

The runtime view of `<project>/<workspace>/`. Represents the *effective* workspace after parent-adapter layering.

| Field | Type | Notes |
|---|---|---|
| `root` | string (absolute path) | resolved workspace directory |
| `catalog` | Catalog | effective catalog (project + parent merged) |
| `templates` | Map<string, TemplateRef> | filename → TemplateRef (project overrides parent by name) |
| `outputMap` | OutputMap | project's if present, else parent's |
| `audits` | AuditRule[] | parent audits then project audits, in order |
| `tokens` | Record<string, unknown> | optional design tokens |
| `guidelines` | string | optional project-wide composition doctrine (markdown) |

**Lifecycle**:
- Constructed once per engine invocation (per pipeline step 1, plan.md / design doc §8).
- Cached in `.composer/cache/` between calls, keyed by the union of: composer.json hash + catalog file mtimes + parent adapter version.

**Invariants**:
- No two primitives share a name unless explicit shadowing is declared (project-level `// composer:shadow @composer/adapter-next:Hero` directive in TSDoc) — `composer doctor` warns.

---

## 3. `Catalog`

The effective set of primitives + rules + registry + index, after parent + project layering.

| Field | Type | Notes |
|---|---|---|
| `primitives` | Map<PrimitiveName, Primitive> | keyed by discriminator literal |
| `rules` | RefineRule[] | semantic rules (superRefine) |
| `slotRegistry` | Map<SlotFamily, Map<VariantName, SlotEntry>> | nested map of slot variants |
| `index` | ZodDiscriminatedUnion | the runtime parser |

**Validation**:
- `index` MUST be `z.discriminatedUnion("primitive", [...])` — checked at load time
- Every Primitive in `primitives` is referenced exactly once in `index`
- No control-flow primitives (constitution VIII): names matching `/^(while|if|else|fork|race|async|await)$/i` are rejected
- Versioned: each Primitive declares its own version; Catalog reports max across primitives as `catalogVersion`

---

## 4. `Primitive`

One record consumed by validation, prompt construction, and codegen (constitution X).

| Field | Type | Notes |
|---|---|---|
| `primitive` | string (discriminator literal) | unique within Catalog |
| `version` | semver string | per-primitive version |
| `schema` | ZodSchema | the structural validator (one branch of the discriminated union) |
| `intent` | string | 1-sentence purpose |
| `whenToUse` | string | when this primitive is the right choice |
| `whenNotToUse` | string[] | counter-examples — asymmetrically valuable, README §4 |
| `fieldGuidance` | Record<string, string> | per-field prose |
| `examples` | object[] | canonical compositions (JSON) |
| `pure` | boolean | declares whether composing this primitive has effects |
| `effects` | string[] | declared effect kinds when `pure: false` |

**Validation**:
- `examples[*]` parse against `schema` cleanly
- At least one example present
- `whenNotToUse` non-empty (README's "asymmetric value" — soft warning, not hard fail)
- LOC count of `template` + `prep` ≤ 30 (FR-006; soft warning at 30, hard error at 60)

---

## 5. `Template`

The Handlebars file that lowers one Primitive to one or more output files.

| Field | Type | Notes |
|---|---|---|
| `primitiveName` | string | which Primitive this serves |
| `outputExt` | string | language extension, e.g., `tsx`, `sql`, `rs` |
| `templateSource` | string | raw Handlebars text |
| `compiled` | HandlebarsTemplateDelegate | cached compiled template |
| `prepFnSource` | string \| null | path to `*.prep.ts` source (null if no prep) |
| `prepCompiled` | PrepFn \| null | sandboxed function ready to call |

**Filename convention**: `<primitiveName>.<outputExt>.hbs` (template), optional `<primitiveName>.prep.ts` (prep).

**Validation**:
- File exists under workspace.templates or parent.templates
- Compiles successfully via Handlebars
- Prep (if present) loads without referencing `process`, `fs`, `require` (static check before sandbox eval)

---

## 6. `Spec`

One JSON file representing a composition.

| Field | Type | Notes |
|---|---|---|
| `id` | string | matches `^[a-z0-9][a-z0-9-]{0,62}$` (R13) |
| `path` | string (relative to workspace root) | typically `specs/<id>.json` |
| `root` | PrimitiveNode | the top-level primitive node |
| `metadata` | object | adapter-defined extras (slug, title, etc.) |

**Lifecycle**:

```
                ┌──────────────┐
                │ agent-context│ (in agent's tokens, ephemeral)
                └──────┬───────┘
                       │ compose(spec_id, json)
                       ▼
                ┌──────────────┐
                │ persisted    │ (.json on disk, validated)
                └──────┬───────┘
                       │ (next compose with same id)
                       ▼
                ┌──────────────┐
                │ regenerated  │ (output rewritten if not drifted)
                └──────────────┘
```

**Invariants**:
- Persistence happens only as part of an atomic compose (FR-003)
- Re-compose with identical JSON + identical catalog + matching output hashes → no-op (FR-016)

---

## 7. `Adapter`

A published npm package shipping pre-packaged starter content.

| Field | Type | Notes |
|---|---|---|
| `name` | string | npm package name |
| `version` | semver | from package.json |
| `catalog` | Partial<Catalog> | adapter-provided primitives/rules/registry |
| `templates` | Record<string, TemplateRef> | adapter templates |
| `outputMap` | OutputMap | spec-kind → output-path mapping |
| `audit` | AuditRule \| null | optional cross-spec rules |
| `bootstrap` | BootstrapFn \| null | runs on `composer init --extends <pkg>` |

**Storage**: live in `node_modules/<name>/`; mirrored to `.composer/cache/parent/` after init (R15).

**Layering with workspace** (FR-007):
- Templates: project overrides by filename
- Primitives: additive merge with shadow warning
- Rules: additive (both run)
- OutputMap: project replaces wholesale or absent → use parent's
- Audit: both run (parent first)
- Bootstrap: runs only at init

---

## 8. `OutputMap`

Declares where generated files land per spec-kind.

| Field | Type | Notes |
|---|---|---|
| `byPrimitive` | Record<PrimitiveName, (node) => OutputPath[]> | resolver function per primitive |
| `specsDir` | string (relative to workspace) | default `specs/` (FR-017) |

`OutputPath` shape:
```ts
{ path: string;                     // relative to project root
  language: string;                  // 'tsx', 'sql', etc. — used for extension validation
  policy?: 'overwrite' | 'one-shot'; // 'one-shot' = only write if missing (e.g., tailwind.config.ts)
}
```

**Validation**: every `path` resolves under project root (R10). Adapter-level violation rejected at workspace resolution.

---

## 9. `SourceMap`

Bi-directional mapping between generated code and source specs (R12).

| Field | Type | Notes |
|---|---|---|
| `version` | number | format version (currently 1) |
| `byFile` | Record<string, FileEntry[]> | output-path → spans |
| `bySpec` | Record<string, SpecEntry[]> | `<spec_id>:<line>` → output spans |

`FileEntry` shape:
```ts
{ line_start: number; line_end: number;
  spec_id: string; spec_line: number;
  primitive: string; node_id: string }
```

**Persistence**: `.composer/cache/sourcemap.json`. Updated atomically alongside output writes (pipeline step 9).

**Queries**:
- `explain(file, line)` → first FileEntry where `line_start ≤ line ≤ line_end`
- `trace(spec_id, line)` → all FileEntry spans whose `spec_line` equals the given line

---

## 10. `OutputHashRecord`

Snapshot of generated-file SHA-256 hashes at last successful compose (R11).

| Field | Type | Notes |
|---|---|---|
| `version` | number | currently 1 |
| `hashes` | Record<string, string> | `<rel-path>` → hex-encoded SHA-256 |
| `lastComposeAt` | ISO timestamp | when this snapshot was recorded |

**Persistence**: `.composer/cache/output.hashes.json`. Updated atomically alongside output writes.

**Drift check** (FR-015):
- For each output path the upcoming compose would write, hash the existing file (LF-normalized)
- Compare to `hashes[path]`
- Mismatch → abort

---

## 11. `ComposeLock`

The whole-workspace lockfile preventing concurrent writes (FR-CONC-001..004).

| Field | Type | Notes |
|---|---|---|
| `pid` | number | PID of the process holding the lock |
| `started_at` | ISO timestamp | when lock was acquired |
| `surface` | `'mcp'` \| `'cli'` | which surface initiated |
| `spec_id` | string | what's being composed |

**Persistence**: `.composer/cache/compose.lock`.

**Lifecycle**:
- Create at compose start; abort if exists AND PID is alive; reclaim if PID is dead (FR-CONC-002/003)
- Delete on successful completion OR any error path (FR-CONC-001)
- `validate` does NOT acquire (FR-CONC-004)

---

## 12. `LogEntry`

The structured JSON record per compose / validate invocation (R14, FR-OBS-001/002/003).

| Field | Type | Notes |
|---|---|---|
| `version` | number | currently 1 |
| `invocation` | object | `{ timestamp, surface, engine_version, adapter_version, node_version, pid }` |
| `spec` | object | `{ id, path, hash }` |
| `phases` | PhaseEntry[] | per-pipeline-step records |
| `errors` | ErrorEntry[] | structured failures (empty on success) |
| `files_written` | FileWritten[] | output writes (empty for validate) |
| `status` | `'ok'` \| `'error'` | overall outcome |

`PhaseEntry`:
```ts
{ phase: PhaseName; duration_ms: number; outcome: 'ok'|'error'|'skipped';
  meta?: object  // phase-specific details (e.g., {files: [...]} for render-staging)
}
```

**Persistence**: `.composer/logs/<ISO-ts>-<spec_id>.json` (compose) or `<ISO-ts>-<spec_id>-validate.json` (validate).

---

## Relationships summary

| From | Relationship | To |
|---|---|---|
| ComposerConfig | declares | Workspace, Adapter (extends) |
| Adapter | layered-into | Workspace (parent provider) |
| Workspace | contains | Catalog, Templates, OutputMap |
| Catalog | indexes | Primitive (many) |
| Primitive | served-by | Template |
| Spec | validates-against | Catalog |
| Spec | renders-via | Template (many, one per node in spec.root tree) |
| Compose | produces | GeneratedFile (many), updates SourceMap and OutputHashRecord |
| Compose | acquires | ComposeLock |
| Compose / Validate | emits | LogEntry |

## State transitions

### Spec lifecycle

```
[agent-context] ──compose──▶ [persisted+validated] ──compose──▶ [regenerated]
                  │                                   │
                  ▼ (validation fail)                 ▼ (drift detected)
              [rejected]                          [aborted]
              (no spec saved)                     (no spec rewrite, no output rewrite)
```

### Output file lifecycle

```
[absent] ──compose──▶ [generated (hash recorded)] ──compose──▶ [regenerated, hash updated]
                              │
                              ▼ (human edits)
                          [drifted] ──next compose──▶ [aborted: drift detected]
```

### ComposeLock lifecycle

```
[absent] ──compose start──▶ [held by PID X] ──compose end──▶ [absent]
              │                       │
              │ (existing lock,       │ (process X dies, lock orphaned)
              │  PID alive)           ▼
              ▼                  [stale]
          [reject: in progress]      │
                                     ▼ (next compose detects stale)
                                  [reclaimed → held by new PID]
```

---

## Notes

- All entities are runtime constructs. None require a database.
- All persistence is filesystem-based JSON or TS source.
- All shared structures are versioned (`version: 1` field) to enable forward-compatible format evolution in v1+.
