# Composer Constitution

> The architectural rules every Composer feature must comply with. These outlive any single feature; they are the invariants the toolkit, the methodology, and the agent contract are built on.

## Core Principles

### I. Schema-Compiled Composition (NON-NEGOTIABLE)

Humans hand-write a small set of typed primitives (the ~5%). LLMs compose JSON against those primitives (the ~95%). A deterministic compiler lowers JSON to real source files. **The LLM never writes code.** The catalog + composition rules + validators are the safety rail that makes LLM authorship stable.

### II. Three Surfaces, One Owner Each

Every Composer system has exactly three surfaces, and one of them is the LLM's only writable output:

- **Catalog** (schema + metadata + template per primitive) — humans
- **Composition** (JSON instances conforming to the catalog) — LLM (sole output)
- **Compiler** (deterministic JSON → target code) — humans

The LLM is fenced into the composition layer. It never touches the runtime source tree, never touches the catalog, never touches the compiler. The escape valve at every layer is *lift to the layer above*; every workaround silently drifts runtime away from what the JSON says.

### III. Atomic Compose

The `compose` operation is transactional: structural validation, semantic validation, audit, spec persistence, and source-file emission happen together or not at all. On any failure during compose, the workspace and the output tree are untouched. There is no half-generated state.

### IV. No Escape Hatches on the Agent Surface

The MCP server exposes workflow-only tools (`discover` / `scaffold` / `validate` / `compose`). There is no `list_primitives`, no `read_template`, no `list_specs`, no `generate` separate from `compose`. The engine controls the loop; the agent does not improvise. Inspection lives on the CLI (humans), not on MCP (agents).

### V. 30-Line Discipline

Every primitive's template + optional prep MUST fit in ≤30 lines combined of pure substitution. Logic beyond that signals the primitive should be decomposed into smaller primitives. The compiler is allowed to be thick; templates are not.

### VI. Drift Detection Mandatory

Every emitted source file carries a `DO NOT EDIT` banner plus per-block source-map comments (`// from: spec.json:LINE`). Before any overwrite, the engine hashes the existing file and aborts on mismatch with a diff and remediation options. Hand-edits to generated code are never silently overwritten. Generated code is an inspectable artifact, not a place humans edit.

### VII. Custom Adapters Are First-Class

The workspace IS an adapter. Published adapters (`@composer/adapter-next`, `@composer/adapter-hono`, etc.) are pre-packaged starter content that a project optionally extends via `composer.json`'s `extends` field. There is no architectural distinction between official and custom adapters — same shape, different distribution.

### VIII. Total Functional Language

The catalog MUST NOT contain control-flow primitives (`while`, `if`, `async`, `fork`, ...). Iteration is encoded as primitives with fixed, declarative iteration models (e.g., `forEach { over, template }`). Every spec is decidable, analyzable, auditable, and LLM-safe; no infinite loop is representable.

### IX. TypeScript / Zod Catalog Authoring

The catalog is authored in TypeScript with Zod discriminated unions plus `superRefine` for semantic rules. The engine is Node-based. The OUTPUT language is unconstrained (templates emit any text), but catalog authoring is TS/Zod for v0 and stays that way absent a concrete demand for polyglot authoring.

### X. The Catalog Is the API

`schema`, `intent`, `whenToUse`, `whenNotToUse`, `fieldGuidance`, and `examples` for a primitive are read from the same single record by validation, prompt construction (what the agent sees in `scaffold`), and IDE/docs. There is no duplicated source of truth.

## Quality Gates

- **Bijection check**: for every primitive in any reference adapter, `JSON → code → JSON` must round-trip. Run in CI.
- **Atomic-rollback test**: inject failure at each pipeline step; assert staging is discarded and outputs are untouched.
- **Drift-detection test**: write generated file, edit by hand, run compose; must abort with diff.
- **Adapter-extends test**: parent adapter + child workspace; assert override and additive-merge rules are honored.
- **30-line lint**: `composer doctor` reports any primitive whose template + prep combined exceed 30 lines.

## Governance

- This constitution supersedes ad-hoc decisions and individual feature plans.
- Amendments require: (a) documented rationale, (b) listed migration impact across existing adapters, (c) maintainer approval.
- All PRs and feature plans must verify compliance; any deviation is justified in writing or is rejected.
- Reference document for the methodology this constitution operationalizes: `/README.md` (Schema-Compiled Composition, 388 lines).
- Reference document for the v0.1 toolkit design: `/docs/superpowers/specs/2026-05-25-composer-design.md`.

**Version**: 1.0.0 | **Ratified**: 2026-05-25 | **Last Amended**: 2026-05-25
