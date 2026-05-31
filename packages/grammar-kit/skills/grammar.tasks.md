---
name: grammar.tasks
description: Turn a catalog design doc into a dependency-ordered, per-primitive authoring task list — schema, metadata, template, output-map entry, audit rule, example/fixture, and bijection test for each primitive.
---

# grammar.tasks

Turn a catalog design doc into a concrete, **per-primitive authoring task
list**: the ordered steps `grammar.author` (and a human reviewer) follow to
draft each primitive into staging. You write **no code** here — you produce a
task list. You do not touch the live catalog.

> Run `grammar.plan` first. The task list is generated **from the design doc**;
> if there is no design, stop and tell the developer to run `grammar.plan`.

## Steps

1. Resolve paths: `bash packages/grammar-kit/scripts/bash/grammar-paths.sh --json`
   (or `composer grammar paths`). Capture `BRIEFS_DIR`, `STAGING_DIR`,
   `TEMPLATES_DIR`.
2. Load the catalog design doc (e.g. `<BRIEFS_DIR>/<name>-design.md`). Read its
   discriminated-union member list, per-primitive sections, slot registry, and
   quality plan.
3. **Order the primitives by dependency.** Author leaf/child primitives and
   shared slot variants **before** the root primitives that compose them, so a
   root's schema can reference children that already exist. Note which tasks are
   independent (parallelizable) and which depend on an earlier primitive.
4. **Emit one task group per primitive.** For each primitive in the design,
   generate this checklist (in this order — each step depends on the one above):

   - **Schema** — write the Zod `z.object({ primitive: z.literal("<Name>"), id,
     … }).strict()` with the fields/refinements from the design. Add it as a
     member of the discriminated union.
   - **Metadata** — fill real `intent`, `whenToUse`, every `whenNotToUse` (≥1),
     `fieldGuidance` per field, ≥1 `example`. No TODOs (constitution X).
   - **Template** — author `templates/<name>.<lang>.hbs`, ≤30 lines of pure
     substitution. If the design flagged decomposition, this task instead splits
     into child-primitive tasks (constitution V).
   - **Output-map entry** — add the `byPrimitive` path + language entry for a
     root; for an inline child, explicitly record "no output-map entry — parent
     renders it".
   - **Audit rule** — add any cross-spec invariant the design named.
   - **Example / fixture** — add the ≥1 example JSON instance as a fixture the
     bijection test consumes.
   - **Bijection test** — a round-trip: a composed instance reads back to the
     same data (the check `composer grammar check` runs / CI enforces).

5. **Whole-catalog tasks** (after the per-primitive groups):
   - Wire all new members into the discriminated union and `index.ts`.
   - Run `composer grammar check <draft>` and resolve every finding.
   - Hand off for human review, then `composer promote <draft>`.

## Conventions to record in the list

- Drafts are authored **only** into the staging dir `design/catalog/ingested/`
  (`<STAGING_DIR>`) — never into `design/catalog/primitives/` or
  `design/templates/` directly. The draft schema file is `<Name>.draft.ts`; the
  template is `<Name>.draft.<lang>.hbs`.
- No primitive named after a control-flow word; iteration is declarative
  (constitution VIII).
- Every primitive's tasks must leave it able to pass `composer grammar check`
  (30-line, total-functional, metadata, coherence). A failing draft cannot be
  promoted without `--force`.

## Output

Write the task list to a sibling of the design (e.g.
`<BRIEFS_DIR>/<name>-tasks.md`). Then point the developer to **`grammar.author`**
to draft the primitives into staging. Nothing here activates anything — the only
activation verb is a human running `composer promote <draft>`.
