# Vocabulary Brief: [FEATURE/TARGET NAME]

**Created**: [DATE]
**Intent (one paragraph)**: [What you want Composer to generate, and for which framework/target.]

> This brief is the human-owned output of `grammar.specify` + `grammar.clarify`.
> It is reviewed by a human and is NOT loaded by the engine. `grammar.plan` turns
> it into a catalog design; `grammar.author` drafts schemas+templates from it.

## Candidate primitives

For each primitive the vocabulary should contain:

### [PrimitiveName]  <!-- PascalCase; never a control-flow word (constitution VIII) -->

- **intent**: [one line — what this primitive is for]
- **whenToUse**: [the situation that calls for it]
- **whenNotToUse**: [≥1 concrete situation where a different primitive fits better]
- **fields / props**: <!-- the schema -->
  - `[field]`: [type] — [fieldGuidance: the author's intent for this field]
- **composition rules**: [is it top-level (emits a file) or an inline child of another primitive? which slots/children may it host?]
- **output mapping**: [file path pattern + language, OR "inline — rendered by parent"]
- **decomposition note**: [if the template would exceed ~30 lines, what smaller primitives it should split into]
- **example**: [≥1 concrete JSON instance the primitive should accept]

<!-- repeat per primitive -->

## Composition shape

[How the primitives nest: the discriminated union members, which are pages/roots,
which are children, and the slot families.]

## Open questions / deferrals

- [Anything the human could not yet decide — marked, not guessed.]

## Clarifications

<!-- grammar.clarify appends a dated session log here: each accepted/overridden answer. -->

### Session [DATE]

- Q: [question] → A: [accepted/overridden answer]
