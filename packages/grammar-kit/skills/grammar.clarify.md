---
name: grammar.clarify
description: Run a recommend-first, ≤5-questions-per-round interview over a vocabulary brief to pin down primitive boundaries, props, composition, output mapping, naming, and decomposition — writing every answer back into the brief. The centerpiece of grammar authoring.
---

# grammar.clarify

This is the **centerpiece** of grammar authoring. You run a short, interactive,
**recommend-first** interview over a vocabulary brief and resolve the
high-impact ambiguities that only a human can decide — what each primitive *is*,
its fields, how it composes, where its output goes, what it's called, and where
to decompose. You **never guess**: every accepted or overridden answer is written
back into the brief's `## Clarifications` log; anything the human can't decide is
marked **deferred**. You produce no code and you do not touch the live catalog.

> Run this BEFORE `grammar.plan`. A developer MAY skip it for an exploratory
> spike, but warn them that downstream rework risk increases — the plan, draft,
> and `composer grammar check` will inherit every unresolved ambiguity.

## Setup

1. Resolve paths: `bash packages/grammar-kit/scripts/bash/grammar-paths.sh --json`
   (or `composer grammar paths`). Capture `BRIEFS_DIR`, `CATALOG_DIR`,
   `PRIMITIVES_DIR`.
2. Load the target brief from `<BRIEFS_DIR>/<name>-brief.md`. If none exists,
   stop and tell the developer to run `grammar.specify` first — do not create a
   brief here.
3. **Be catalog-aware.** Read `<CATALOG_DIR>/index.ts` and `<PRIMITIVES_DIR>/`
   if present. Hold the existing primitive names + intents in mind throughout —
   you will flag overlap and collision against them.

## The taxonomy you scan

Read `packages/grammar-kit/taxonomy/clarify-taxonomy.md` and scan the brief
against its **eight** categories. For each, mark **Clear / Partial / Missing**.
Build an internal coverage map (don't print it unless you'll ask no questions):

1. **Primitive boundary** — is this one primitive or several? Does it conflate a
   container with its items?
2. **Fields / props** — required vs optional, types, refinements (min/regex/format).
3. **Composition rules** — root (emits a file) vs inline child; which slot
   families/variants it hosts.
4. **Output mapping** — a file path + language, or inline (rendered by parent,
   no `byPrimitive` entry).
5. **Naming** *(gated)* — PascalCase, domain-meaningful, and **never a
   control-flow word**.
6. **Decomposition / 30-line** *(gated)* — will the template stay ≤30 lines of
   pure substitution? If not, what does it split into?
7. **Total-functional** *(gated)* — does the request smuggle in conditionals or
   loops? Steer to a declarative encoding.
8. **Metadata** *(gated)* — real `intent`, `whenToUse`, ≥1 `whenNotToUse`,
   per-field guidance, ≥1 example.

Categories marked **(gated)** are also enforced mechanically by
`composer grammar check`. Resolving them now means the eventual draft passes the
gate instead of failing it later.

## Building the question queue

Generate an internal, prioritized queue of candidate questions:

- **Highest-impact first.** Rank by (Impact × Uncertainty). A wrong primitive
  boundary or a control-flow-shaped primitive costs far more than a field's
  optionality — ask those first.
- **≤5 questions per round.** Stop a round early when the high-impact
  ambiguities are resolved. Multiple rounds are allowed; offer another round
  only if Partial/Missing high-impact categories remain.
- Each question must be answerable as a short multiple-choice pick (2–5 mutually
  exclusive options) or a ≤5-word phrase.
- Skip anything already decided in the brief, pure stylistic preference, or
  better deferred to `grammar.plan`.

## The interview loop

Ask **exactly one question at a time**. Every question is **recommend-first** —
you analyze the options and lead with the answer you'd choose:

- For a multiple-choice question, lead with
  `**Recommended:** Option <X> — <1–2 sentence reasoning>`, then a Markdown table:

  | Option | Description |
  |--------|-------------|
  | A | … |
  | B | … |
  | C | … (up to E) |
  | Short | A different ≤5-word answer (if a free-form alternative fits) |

  Close with: *Reply with the option letter, say "recommended"/"yes" to accept,
  or give your own ≤5-word answer.*

- For a short-answer question, lead with
  `**Suggested:** <answer> — <brief reasoning>`, then: *Answer in ≤5 words, or say
  "yes" to accept the suggestion.*

When the human answers: if they say "yes"/"recommended"/"suggested", use your
stated recommendation. Otherwise validate the answer fits an option or the
≤5-word limit; if ambiguous, ask one disambiguation (same question, no new
count). Then record it and advance.

Stop asking when: all high-impact ambiguities are resolved, the human signals
done ("stop"/"good"/"proceed"), or you've asked 5 in this round.

## Steering rules (non-negotiable — apply mid-interview)

These override a human's stated preference for *shape*; you still let them decide
the *domain* design:

- **Control-flow smuggling.** If an answer would create an `if`/`while`/`for`/
  `switch`/`when` primitive, do **not** offer it as a clean option. Recommend the
  **declarative** encoding instead — a fixed `forEach { over, template }`
  iteration primitive, or an enum/variant field — and explain that Composer's
  catalog is total/declarative (constitution VIII). Iteration is data, not control.
- **Oversized template.** If a primitive's template would exceed ~30 lines of
  pure substitution, recommend **decomposition** into smaller primitives and ask
  the human to confirm the split (constitution V). Don't let a one-primitive
  answer stand if it can't render in ≤30 lines of substitution.
- **Naming a control-flow word.** Reject `If`/`While`/`For`/`Switch`/`When` as a
  primitive name; recommend a domain-meaningful PascalCase name.
- **Catalog overlap / collision** (catalog-aware). If a candidate duplicates or
  heavily overlaps an existing primitive, surface that primitive and recommend
  **reuse/extension** over a near-twin. If a candidate's name already exists in
  the live catalog, flag it now — `composer promote` will refuse the collision,
  so resolve the name here.
- **Missing metadata.** If `whenNotToUse`, per-field guidance, or an example is
  absent, treat it as a question, not a silent gap — the gate refuses empty
  metadata.

## Writing answers back into the brief

After **each** accepted answer, update the brief on disk (atomic overwrite,
preserve all other formatting):

1. Ensure a `## Clarifications` section exists (the template already has one),
   and a `### Session YYYY-MM-DD` subheading for today.
2. Append one bullet: `- Q: <question> → A: <final answer>`.
3. **Apply the decision to the relevant part of the brief**, not just the log:
   - boundary/composition → the candidate primitive's entry (split, merge, or
     re-parent it)
   - fields/props → that primitive's fields list, with the new type/refinement
   - output mapping → its output-mapping line
   - naming → rename the primitive heading (and references)
   - decomposition → its decomposition note (and add the child primitives)
   - total-functional → replace the control-flow shape with the declarative
     encoding
   - metadata → fill `intent`/`whenToUse`/`whenNotToUse`/field guidance/example
   If a decision invalidates an earlier line, **replace** it — leave no
   contradictory text.

## Deferrals and blocking flags

- If the human cannot resolve a question, record it under the brief's
  `## Open questions / deferrals` as deferred — **never guess**.
- If an answer would force a constitution MUST violation (a control-flow
  primitive, an un-decomposable oversized template), record it as a **blocking
  flag** in the brief so it surfaces before promote.

## Report

When the interview ends, report: questions asked/answered this round, the brief
path, which primitives/sections you touched, and a short coverage summary per
taxonomy category (Resolved / Deferred / Clear / Outstanding). If high-impact
categories remain Outstanding, offer another round. Otherwise, point the
developer to **`grammar.plan`**. Remind them nothing here activates anything —
only a human running `composer promote <draft>` ever changes the live catalog.
