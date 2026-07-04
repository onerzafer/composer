# Contract — CLI Commands

**Binary**: `composer` (shipped via `@composer/cli`)

## Conventions

- All commands accept `--workspace <path>` to override workspace discovery (default: walk upward from CWD looking for `composer.json`).
- All commands return exit code `0` on success, non-zero on failure.
- All commands write a structured JSON log to `.composer/logs/<ts>-<command>.json` if they engage the engine pipeline. `init`, `explain`, `trace`, `doctor` log too.
- Output format: human-readable text to stdout by default. `--json` flag switches stdout to machine-readable JSON. Stderr is always one-line summary on completion (FR-OBS-002).

## Commands

### `composer init`

Initialize a new Composer-instrumented project.

```text
Usage: composer init [options]

Options:
  --extends <pkg>      Adopt a published adapter (npm package@version)
  --bare               No extends; minimal workspace skeleton
  --workspace <path>   Workspace folder name (default: ./design)
  --json               Machine-readable output

Exit codes:
  0   Project initialized successfully (including sample compose)
  1   composer.json already exists at project root
  2   Adapter resolution failed (npm fetch error, package not found)
  3   Bootstrap step failed (adapter's bootstrap.ts threw)
  4   Sample compose failed (engine couldn't validate the starter spec)
```

**Behavior**:
1. Refuse if `composer.json` exists at project root (exit 1).
2. If `--extends`: `npm install <pkg>`, cache parent under `.composer/cache/parent/`, run adapter's `bootstrap.ts`.
3. If `--bare`: create minimal `<workspace>/{catalog,templates,specs}/` with one example primitive + template.
4. Write `composer.json` with the appropriate fields.
5. Append `.composer/cache/`, `.composer/logs/`, `.composer/staging/` to `.gitignore`.
6. Run one sample `compose` to demonstrate end-to-end and prove the loop works (acceptance scenario US2#1).

**Success criterion**: completes in ≤30 seconds (SC-002).

---

### `composer compose <spec_id>`

Run an atomic compose on an existing spec file (human/CI alternative to the MCP `compose` tool).

```text
Usage: composer compose <spec_id> [options]

Options:
  --dry-run            Equivalent to `composer validate <spec_id>`
  --strict             Exit non-zero (3) if the audit reports any warning, not just errors
  --json               Machine-readable output
  --workspace <path>   Override workspace discovery

Exit codes:
  0   compose succeeded (or dry-run completed with ok=true)
  1   structural validation failed
  2   semantic validation failed
  3   audit failed (including warnings escalated by --strict)
  4   drift detected — generated file has been hand-edited
  5   render failed (template or prep exception)
  6   IO failed (write/rename)
  7   lock held (another compose in progress)
  8   path traversal (output.map declared a path outside project root)
```

**Behavior**:
- Reads spec from `<workspace>/specs/<spec_id>.json`.
- Runs the full atomic pipeline (same as MCP `compose` tool — FR-003).
- On success: prints files written + log path, followed by any audit warnings.
- On failure: prints structured error, phase name, suggestions; exit code matches the failure type.
- `--strict`: without it, audit warnings are reported but do not fail the compose (`audit.ok` stays `true`, warnings are listed); with it, any warning collected across the audit chain is escalated into an audit failure (same as an audit error — exit 3). Has no effect combined with `--dry-run` (dry-run always delegates to `validate`, which never escalates).

---

### `composer validate <spec_id>`

Preview a compose without writing.

```text
Usage: composer validate <spec_id> [options]

Options:
  --json               Machine-readable output

Exit codes:
  0   validate ok — would write would succeed
  1   structural validation failed
  2   semantic validation failed
  3   audit failed
```

**Behavior**: identical to `compose --dry-run`. Writes a validate log per FR-OBS-003.

---

### `composer explain <file>:<line>`

Source-map traversal: code → spec.

```text
Usage: composer explain <file-path>:<line-number> [options]

Options:
  --json               Machine-readable output

Exit codes:
  0   span found and reported
  1   file not in source map (not a generated file)
  2   line out of bounds
```

**Output** (text mode):
```text
src/app/pricing/page.tsx:42
  spec:      design/specs/pricing.json:12
  primitive: Hero
  node_id:   pricing-hero
```

**Output** (`--json` mode):
```json
{ "file": "src/app/pricing/page.tsx", "line": 42,
  "spec_id": "pricing", "spec_line": 12,
  "primitive": "Hero", "node_id": "pricing-hero" }
```

**Success criterion**: ≤1 second for projects with ≤100 specs (SC-005).

---

### `composer trace <spec_id>:<line>`

Source-map traversal: spec → code.

```text
Usage: composer trace <spec_id>:<line-number> [options]

Options:
  --json               Machine-readable output

Exit codes:
  0   spans found and reported
  1   spec_id not found
  2   line not associated with any output span
```

**Output** (text mode):
```text
design/specs/pricing.json:12 (primitive=Hero, node_id=pricing-hero)
  → src/app/pricing/page.tsx:42-58
  → src/lib/forms/pricing.ts:9-14
```

---

### `composer doctor`

Health check report.

```text
Usage: composer doctor [options]

Options:
  --refresh-parent     Re-fetch the parent adapter from npm (R15)
  --json               Machine-readable output
  --strict             Exit non-zero on any warning (default: exit 0 unless errors)

Exit codes:
  0   No errors (warnings allowed unless --strict)
  1   Errors found (broken catalog, drift, etc.)
```

**Reports**:
- **Workspace status**: composer.json valid, workspace folder present, engine version, adapter version + freshness
- **Primitive sprawl**: usage count + last-used per primitive; warn if total > 50; warn if any unused > 90 days
- **Discipline violations**: template+prep LOC > 30 per primitive
- **Drift state**: which output files diverge from their recorded hashes
- **Bijection check**: JSON → code → JSON round-trip per primitive (CI-targeted)
- **Stale lock**: `.composer/cache/compose.lock` exists but PID is dead — warns and reclaims
- **Naming hygiene**: any primitive named `while` / `if` / `else` / `async` / `await` (constitution VIII)

---

## Reserved namespace (v1.x — not implemented in v0.1)

```text
composer ingest <plugin> <source>    Brownfield ingestion (e.g., `composer ingest react src/components/`)
composer promote <ingested-file>     Move from design/catalog/ingested/ → design/catalog/primitives/
composer migrate [--from X --to Y]   Catalog version codemods
```

These commands MUST exist in v0.1's `--help` output as documented reservations so the CLI namespace is stable. Implementations may stub them with `exit 99, "not implemented in v0.1"`.

---

## Global options (all commands)

```text
--help               Show command help
--version            Print engine + cli version
--quiet              Suppress non-essential output
--verbose            Verbose human-readable output (mirrors structured log to stderr)
--workspace <path>   Override workspace discovery
--json               Machine-readable output (where applicable)
```

---

## Exit code summary

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic / structural failure (varies by command, see per-command tables) |
| 2 | Semantic / resolution failure |
| 3 | Audit / bootstrap failure |
| 4 | Drift detected |
| 5 | Render / prep failure |
| 6 | IO failure |
| 7 | Lock held |
| 8 | Path traversal |
| 99 | Reserved command (ingest/promote/migrate) not implemented in v0.1 |
