---
name: grammar.plan
description: Turn a clarified vocabulary brief into a concrete catalog design doc — discriminated-union shape, per-primitive Zod fields, metadata plan, 30-line template plan, output-map plan, and slot registry.
---

# grammar.plan

Take a clarified vocabulary brief and produce a **catalog design doc**: the
concrete TypeScript/Zod shape that `grammar.author` will later draft into
staging. You still write **no executable code** here — you produce a design
document a human reviews. Catalog authoring is TypeScript + Zod (constitution
IX), so the design is expressed in that vocabulary. You do not touch the live
catalog.

> Run `grammar.clarify` first. If the brief still has unresolved high-impact
> ambiguities in `## Open questions / deferrals`, say so and recommend another
> clarify round before planning — a design built on guesses inherits them.

## Steps

1. Resolve paths: `bash packages/grammar-kit/scripts/bash/grammar-paths.sh --json`
   (or `composer grammar paths`). Capture `BRIEFS_DIR`, `CATALOG_DIR`,
   `PRIMITIVES_DIR`, `TEMPLATES_DIR`.
2. Load the target brief from `<BRIEFS_DIR>/<name>-brief.md`. Read its
   `## Clarifications` log — those are decided constraints; honor them.
3. **Be catalog-aware.** If a catalog exists, read `<CATALOG_DIR>/index.ts` and
   the existing primitives so the design extends the existing discriminated
   union (reusing slot families, output-map conventions, and naming) rather than
   inventing a parallel one.
4. **Draft the design from the template.** Copy
   `packages/grammar-kit/templates/catalog-design.md` and fill it in:
   - **Discriminated union** — list every member of
     `z.discriminatedUnion("primitive", [...])`, including primitives reused from
     the existing catalog.
   - **Per-primitive design** — for each new primitive:
     - **Zod schema** — `primitive` literal, `id`, and each field as a `z.<type>()`
       with the refinements the brief settled (`.min()`, `.regex()`, `.optional()`,
       nested objects, `z.array(...)` for declarative iteration). Use `.strict()`.
     - **Metadata** — name the real `intent`, `whenToUse`, every `whenNotToUse`
       (≥1), `fieldGuidance` per field, and ≥1 example. These are the API the
       composing agent sees in `scaffold`; no TODOs (constitution X).
     - **Template plan** — sketch the `templates/<name>.<lang>.hbs` substitution
       and **run the 30-line check**: if it can't render in ≤30 lines of pure
       substitution, list the child primitives it splits into instead
       (constitution V).
     - **Output map** — a `byPrimitive` entry (path pattern + language) for roots,
       or "inline — parent renders it" for children.
     - **Slots / children** — which slot family / variants it hosts, if any.
     - **Audit rule** — any cross-spec invariant it implies.
5. **Slot registry** — if the design uses slots, fill the
   `family → variant → { importPath, exportName }` table.
6. **Quality plan** — restate that every drafted primitive must pass
   `composer grammar check` before `promote`: 30-line, total-functional (no
   control-flow name/shape), metadata completeness, schema↔template↔output-map↔
   meta coherence. `promote` refuses a failing draft unless `--force`.

## Constitution checks before you finish

- **No control-flow primitive** — no member named `If`/`While`/`For`/`Switch`/
  `When`; iteration is a declarative field (`z.array(...)` consumed by a fixed
  `forEach`-style primitive), not a control-flow construct (constitution VIII).
- **30-line discipline** — every template plan is either ≤30 lines of
  substitution or carries an explicit decomposition (constitution V).
- **Metadata complete** — every primitive's metadata plan names real values, not
  placeholders (constitution X).

If any check fails, fix the design or send it back to `grammar.clarify` — do not
plan a primitive that cannot be promoted.

## Output

Write the design to a sibling of the brief (e.g.
`<BRIEFS_DIR>/<name>-design.md`) or wherever the developer keeps design docs.
Then point them to **`grammar.tasks`** to turn the design into a per-primitive
authoring task list. Nothing here activates anything — the only activation verb
is a human running `composer promote <draft>`.
