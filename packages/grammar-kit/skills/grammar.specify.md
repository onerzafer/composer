---
name: grammar.specify
description: Turn a plain-language intent ("generate X for framework Y") into a human-owned vocabulary brief — the first step of authoring a Composer grammar (catalog of primitives).
---

# grammar.specify

You are starting the **grammar authoring** workflow for Composer. The developer
has described, in natural language, code they want Composer to be able to
generate. Your job in this phase is to turn that intent into a **vocabulary
brief** — a structured, human-owned Markdown doc listing the candidate
primitives the catalog will need. You do **not** write any TypeScript, Zod,
templates, or code here, and you do **not** touch the live catalog. You draft a
brief a human will refine (via `grammar.clarify`) and own.

The developer's intent is the text after `grammar.specify`. Use it as-is; do not
ask them to repeat it.

## Steps

1. **Locate the workspace.** Run the path helper and parse its JSON:

   ```bash
   bash packages/grammar-kit/scripts/bash/grammar-paths.sh --json
   ```

   (Or run `composer grammar paths` if available — it prints the same resolved
   paths.) Capture `BRIEFS_DIR`, `CATALOG_DIR`, `PRIMITIVES_DIR`,
   `STAGING_DIR`. If no `composer.json` is found, stop and tell the developer to
   run from inside a Composer-instrumented project.

2. **Be catalog-aware.** Check whether a catalog already exists at
   `<CATALOG_DIR>/index.ts` (and read `<PRIMITIVES_DIR>/`). If it does, list the
   existing primitive **names and one-line intents** and surface them to the
   developer before you draft anything. The goal is to **reuse or extend**
   existing primitives, not duplicate them. Explicitly note any candidate that
   overlaps an existing primitive so the brief can fold into it instead of
   adding a near-twin. If no catalog exists yet, treat this as a greenfield
   vocabulary.

3. **Draft the brief from the template.** Copy
   `packages/grammar-kit/templates/vocabulary-brief.md` and fill it in:
   - **Intent** — one paragraph: what to generate and for which framework/target.
   - **Candidate primitives** — for each primitive you can identify from the
     intent, fill every field the template asks for: `intent`, `whenToUse`,
     ≥1 `whenNotToUse`, fields/props with per-field guidance, composition rules
     (root vs inline child, which slots/children it hosts), output mapping
     (file path + language, or inline), a decomposition note, and ≥1 example
     JSON instance.
   - **Composition shape** — how the primitives nest: which are roots (emit a
     file), which are inline children, the slot families.
   - **Open questions / deferrals** — anything you cannot decide from the intent
     alone. Mark it; never invent an answer.

4. **Apply the constitution while drafting** (these are the same rules
   `grammar.clarify` will interrogate, so get them right early):
   - **Naming** — PascalCase, domain-meaningful. **Never** name a primitive after
     a control-flow word (`If`, `While`, `For`, `Switch`, `When`). A control-flow
     name signals a forbidden control-flow primitive.
   - **Total-functional** — if the intent wants conditionals or loops, encode
     them **declaratively** (a fixed `forEach { over, template }`, or an
     enum/variant field), never as an `if`/`while` primitive. Note this in the
     brief.
   - **30-line discipline** — if a primitive's template would clearly exceed ~30
     lines of pure substitution, record a decomposition note splitting it into
     smaller primitives.
   - **Metadata is the API** — every primitive needs real `intent`, `whenToUse`,
     ≥1 `whenNotToUse`, per-field guidance, and ≥1 example. No TODOs.

5. **Write the brief** to `<BRIEFS_DIR>/<name>-brief.md`, where `<name>` is a
   short kebab-case slug for the target (e.g. `next-marketing-brief.md`). Create
   `<BRIEFS_DIR>` if it does not exist.

## After this phase

Tell the developer the brief is a **starting draft, not a decision**. Direct them
to run **`grammar.clarify`** next — the recommend-first interview that pins down
the ambiguous decisions and writes them into the brief. Nothing you produced here
touches the live catalog; the only verb that ever activates a primitive is a
human running `composer promote <draft>`.
