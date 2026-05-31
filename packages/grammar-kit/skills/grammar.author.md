---
name: grammar.author
description: Draft each primitive (a Zod schema .ts with full metadata + a ≤30-line Handlebars template) from the design and task list, staging it into design/catalog/ingested/ — inert, never activated. The human reviews and promotes.
---

# grammar.author

Draft the primitives the design and task list describe — for each, a Zod schema
`.ts` file with **full metadata** and a Handlebars `.hbs` template — and **stage**
them. This is the one grammar phase that writes TypeScript and templates. It is
still **drafting, not activating**: you write **only** into the engine-ignored
staging dir, you **never** promote, and the live catalog, `discover`, `scaffold`,
and `compose` are unaffected until a human runs `composer promote`.

> Run `grammar.tasks` first (which runs after `grammar.plan`). Author **from** the
> design doc and task list — do not re-derive the design here.

## Hard boundaries (do not cross)

- **Write ONLY to the staging dir** `design/catalog/ingested/` (`<STAGING_DIR>`).
- **NEVER write to** `design/catalog/primitives/` (`<PRIMITIVES_DIR>`) or
  `design/templates/` (`<TEMPLATES_DIR>`) — those are the live catalog; only
  `composer promote` moves a draft there.
- **NEVER promote.** You stage; the human reviews and runs `composer promote`.
- **NEVER name a primitive after a control-flow word** (`If`/`While`/`For`/
  `Switch`/`When`); iteration is declarative (constitution VIII).
- **Templates ≤30 lines of pure substitution.** If a template can't, the design
  was wrong — stop and send it back to `grammar.plan`/`grammar.clarify` to
  decompose, rather than authoring an oversized template (constitution V).

## Steps

1. Resolve paths: `bash packages/grammar-kit/scripts/bash/grammar-paths.sh --json`
   (or `composer grammar paths`). Capture `STAGING_DIR`, `PRIMITIVES_DIR`,
   `TEMPLATES_DIR`. Confirm `STAGING_DIR` ends in `catalog/ingested`.
2. Load the design doc and task list. Author primitives in the task list's
   dependency order (children/slot variants before roots).
3. **For each primitive, stage the draft via the CLI/helper** rather than writing
   files blind — use `composer grammar <phase>` (the deterministic stager) if it
   offers a stage subcommand; otherwise write the two files directly into
   `<STAGING_DIR>`:
   - **Schema** — `<STAGING_DIR>/<Name>.draft.ts`: the `z.object({ primitive:
     z.literal("<Name>"), id, … }).strict()` schema **plus its metadata** —
     real `intent`, `whenToUse`, every `whenNotToUse` (≥1), `fieldGuidance` per
     field, and ≥1 `example`. No TODOs or empty strings; the gate refuses them
     (constitution X).
   - **Template** — `<STAGING_DIR>/<Name>.draft.<lang>.hbs`: ≤30 lines of pure
     Handlebars substitution. Declarative iteration only (a fixed
     `{{#each over}}…{{/each}}`-style block fed by an array field) — no
     conditional or loop *primitives*.
4. **Keep schema, template, metadata, and output map coherent.** Every field the
   schema declares should be referenced by the template or intentionally omitted;
   every template placeholder should map to a schema field. Roots get a
   `byPrimitive` output-map entry; inline children get none.

## After drafting

1. Run the quality gate and resolve every finding:

   ```bash
   composer grammar check <draft>
   ```

   Exit 0 means all checks pass (30-line, total-functional, metadata
   completeness, schema↔template coherence; bijection runs in CI). Non-zero
   lists the failing checks — fix the draft and re-run.

2. Tell the developer the draft is staged and **inert**: it does not affect
   `discover`, `scaffold`, or `compose`. Instruct them to **review and edit** the
   staged `.ts` + `.hbs`, then activate it **themselves**:

   ```bash
   composer promote <draft>
   ```

   `promote` is the only verb that changes the live catalog; it refuses a name
   collision and refuses a draft that fails `composer grammar check` unless
   `--force` (which records the overridden findings). Do **not** run `promote`
   for them, and do **not** suggest `--force` to skip a real failure — fix the
   draft instead.
