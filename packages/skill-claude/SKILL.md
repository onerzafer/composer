---
name: composer-attached
description: Use whenever you detect a `composer.json` in the project root. Routes every code change through Composer's discover → scaffold → compose loop instead of writing source files directly.
---

# Composer Skill (Claude Code)

You are attached to a **Composer-instrumented project**. The project's `composer.json` declares a catalog of typed primitives (e.g., `Page`, `Hero`, `Section`, `Card`, `CTA` for a Next.js project). Your job is to compose features as JSON against that catalog — never to write source files directly.

## Workflow

1. **Always start with `discover()`**. The response gives you the catalog (primitive names + intents), existing specs, project guidelines, and design tokens. Light overview — no schemas. Total response stays under ~5,000 tokens.

2. **Use `scaffold()` for details**.
   - To learn a primitive: `scaffold({ kind: "primitive", primitive: "Hero", intent: "<feature description>" })` returns the full Zod-as-JSON schema + skeleton + examples + `whenNotToUse` + field guidance.
   - To edit an existing spec: `scaffold({ kind: "spec", spec_id: "pricing" })` returns the current JSON content.
   - **There is no other way to read the catalog or workspace.** No `list_primitives`, no `read_template`, no `read_spec`. The workflow is the surface.

3. **Compose the JSON in your own context**. Use the schema, the examples, the `whenToUse`/`whenNotToUse` to pick the right primitive and shape its fields. Pay attention to `fieldGuidance` — that's the human author's intent for each field.

4. **Cheap reality check with `validate()`** *(optional)*. Side-effect-free dry-run. Returns the same errors `compose` would, plus the file diffs that would result. Run this if you want to be sure before committing.

5. **Atomic `compose()`**. The only tool that mutates. If everything succeeds, the spec is persisted to `<workspace>/specs/<spec_id>.json` AND the generated source files land on disk. If anything fails — structural validation, semantic rules, audit, drift detection — **nothing is written**. The workspace and outputs are byte-identical to before the call.

## Hard rules (constitution v1.0.0)

- **You never write source files directly.** No `Edit` / `Write` on `src/**`. Generated code is an inspectable artifact, not a place you edit.
- **The catalog + composition rules are the contract.** If a primitive doesn't fit, the answer is escalate to the human (catalog change), not work around it.
- **Compose is atomic.** Don't try to write the spec yourself and then call compose — `compose(spec_id, json)` does the persistence for you.
- **No control-flow primitives exist.** The catalog is total/declarative. If you want iteration, find an iteration-shaped primitive (e.g., `forEach`).

## Debugging

If a generated file has a bug:
- Run `composer explain <file>:<line>` to find the originating spec node.
- Fix the spec (data), the template (rendering), or the catalog (structure) — never the generated file.

If `compose` fails with `DRIFT_DETECTED`: a human (or you) edited a generated file by hand. Resolution options are in the error:
  (a) `git checkout <file>` then `composer compose <spec>` again, OR
  (b) lift the change into the spec / template / catalog, then `composer compose <spec>`.

## What you have to work with

- **`composer.discover`** — catalog overview + workspace state
- **`composer.scaffold`** — full primitive details OR existing spec content
- **`composer.validate`** — preview-only, no writes, no lock
- **`composer.compose`** — atomic write

That's the whole agent surface. Four tools. The discipline of staying inside them is what makes the LLM-authored layer stable.
