# Contract — MCP Tools

**Server**: `@composer/mcp` (stdio transport)

**Tools exposed**: exactly 4 (workflow-only per constitution IV, FR-001):

| Tool | Mutates state? | Notes |
|---|---|---|
| `composer.discover` | no | catalog index + workspace state |
| `composer.scaffold` | no | lazy-load primitive details OR existing spec |
| `composer.validate` | no | dry-run / preview |
| `composer.compose` | yes (atomic) | the only write boundary |

All responses include `suggested_next: string` to guide the agent's workflow.

---

## `composer.discover`

### Request

```json
{}
```

No arguments.

### Response

```json
{
  "project": {
    "name": "string",
    "engine": "string",
    "adapter": "string | null",
    "version": "string"
  },
  "primitives": [
    {
      "name": "string",
      "intent": "string",
      "whenToUse": "string"
    }
  ],
  "specs": [
    {
      "id": "string",
      "summary": "string",
      "updated": "ISO timestamp"
    }
  ],
  "guidelines": "string (markdown)",
  "tokens": "object | null",
  "catalog_version": "semver string",
  "suggested_next": "scaffold"
}
```

**Constraints**:
- Total response ≤ 5,000 tokens for the reference adapter (SC-009)
- `primitives[*]` contains intent + whenToUse but NOT schemas (light overview only — FR-024 / spec §7.1)
- `specs[*]` contains summary + updated but NOT full content

**Errors**:
| Code | Condition |
|---|---|
| `WORKSPACE_NOT_FOUND` | composer.json missing at project root |
| `WORKSPACE_INVALID` | workspace folder unreadable or schema-invalid |
| `EXTENDS_RESOLUTION_FAILED` | parent adapter unreachable AND not in cache |

---

## `composer.scaffold`

### Request (variant A — primitive)

```json
{
  "kind": "primitive",
  "primitive": "string (must exist in catalog)",
  "intent": "string (optional, free-form description of the feature)"
}
```

### Request (variant B — existing spec)

```json
{
  "kind": "spec",
  "spec_id": "string (must exist in workspace/specs/)"
}
```

### Response (variant A)

```json
{
  "spec_id": "string (server-suggested ID for the new spec, derived from intent)",
  "skeleton": "object (starter JSON with placeholders)",
  "schema": "object (full Zod-as-JSON for the primitive)",
  "field_guidance": { "<path>": "string" },
  "when_not_to_use": ["string"],
  "examples": ["object"],
  "suggested_next": "compose"
}
```

### Response (variant B)

```json
{
  "spec_id": "string (echoes request)",
  "json": "object (full content of the existing spec)",
  "suggested_next": "compose"
}
```

**Constraints**:
- `scaffold` is the agent's ONLY read endpoint into the catalog or workspace (FR-002)
- No tool exists to retrieve a primitive's schema independently of `scaffold`
- No tool exists to list templates

**Errors**:
| Code | Condition |
|---|---|
| `PRIMITIVE_NOT_FOUND` | primitive name not in catalog (variant A) |
| `SPEC_NOT_FOUND` | spec_id has no file at `<workspace>/specs/<id>.json` (variant B) |
| `INVALID_INPUT_KIND` | `kind` not in `["primitive", "spec"]` |

---

## `composer.validate`

### Request

```json
{
  "spec_id": "string",
  "json": "object"
}
```

### Response

```json
{
  "ok": "boolean",
  "errors": [
    { "path": "string", "message": "string", "suggestion": "string | null" }
  ],
  "warnings": [
    { "path": "string", "message": "string" }
  ],
  "would_write": [
    { "path": "string", "kind": "created | updated", "diff": "string" }
  ],
  "suggested_next": "compose | scaffold"
}
```

**Constraints**:
- Side-effect-free (FR-004): no spec saved, no file written, no lock acquired
- Runs the same validation pipeline as compose (steps 4–6 of pipeline) plus a staging render to produce `would_write`
- Writes a log file at `.composer/logs/<ts>-<spec_id>-validate.json` (FR-OBS-003)

**Errors**: structural and semantic validation results are returned in `errors[]` with `ok: false`. Tool-level errors (network, IO) surface as exceptions, not as the response shape.

---

## `composer.compose`

### Request

```json
{
  "spec_id": "string",
  "json": "object",
  "options": {
    "dry_run": "boolean (default false; equivalent to validate)"
  }
}
```

### Response (success)

```json
{
  "spec_saved": "string (path relative to project root)",
  "files_written": [
    { "path": "string", "kind": "created | updated", "diff": "string" }
  ],
  "audit": { "ok": true, "warnings": [] },
  "log": "string (path to .composer/logs/<ts>-<spec_id>.json)",
  "suggested_next": "done"
}
```

### Response (failure)

```json
{
  "ok": false,
  "phase": "string (pipeline phase where failure occurred)",
  "errors": [
    { "path": "string | null", "message": "string", "suggestion": "string | null" }
  ],
  "log": "string (path to .composer/logs/<ts>-<spec_id>.json)",
  "suggested_next": "scaffold"
}
```

**Constraints (atomic — FR-003 / FR-CONC-001..003)**:
- Acquires `.composer/cache/compose.lock` before any work (FR-CONC-001)
- On lock conflict: returns `LOCK_HELD` error with the lock-holder's PID and start time (FR-CONC-002)
- All work happens in `.composer/staging/`
- Atomic-rename happens only after every preceding step succeeds (pipeline step 9)
- On any failure: staging discarded, no spec saved, no output touched, lock released

**Errors**:
| Code | Condition |
|---|---|
| `LOCK_HELD` | another compose is in progress (PID alive) |
| `STRUCTURAL_INVALID` | Zod parse failed |
| `SEMANTIC_INVALID` | superRefine rule violated |
| `AUDIT_FAILED` | cross-spec audit rejected |
| `DRIFT_DETECTED` | existing output file's hash diverged (FR-015) |
| `PATH_TRAVERSAL` | output.map declared a path outside project root (R10) |
| `RENDER_FAILED` | template render or prep threw |
| `IO_FAILED` | filesystem write or rename failed |

Every error response includes the `phase` field naming which pipeline step failed. The error matches one of the phase outcomes recorded in the LogEntry (R14).

---

## Tool descriptions (as exposed to the agent in MCP `tools/list`)

The MCP server exposes each tool with a `description` field that the agent uses to decide when to call. These descriptions are part of the contract because the agent's reasoning depends on them.

```text
composer.discover:
  "List the project's primitives (names + intents only), existing specs (ids
  + summaries), composition guidelines, and design tokens. CALL THIS FIRST
  whenever you attach to a Composer-instrumented project; the response is
  light (no schemas). Use scaffold() to get full primitive details."

composer.scaffold:
  "Either: (kind='primitive') return the full schema, examples, and field
  guidance for one primitive, plus a starter JSON skeleton; OR
  (kind='spec') return the full JSON content of an existing spec for
  editing. This is the only way to read catalog details or workspace
  specs."

composer.validate:
  "Dry-run a draft spec without writing anything. Returns the same errors
  compose would surface, plus the file diffs that would result. Use this
  for a cheap reality check before compose."

composer.compose:
  "Atomically validate, persist, and emit. If everything succeeds, the
  spec file is saved and the generated source files are written. If
  anything fails, NOTHING is written. This is the only tool that mutates
  the project."
```

---

## Notes for implementers

- Tool argument validation: every request is checked against its schema before dispatch. Schema violations return `INVALID_INPUT` with the offending field path.
- Output marshalling: responses are JSON-serializable. No streaming for v0.1.
- Tool descriptions are part of the API surface. Changing them requires a major-version bump of `@composer/mcp`.
- Error structure: every error has `code` (machine-readable), `message` (human-readable), `phase` (which pipeline step), and optional `path` / `suggestion`.
