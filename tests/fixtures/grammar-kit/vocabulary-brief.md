# Vocabulary Brief: Greeting module

**Created**: 2026-05-30
**Intent (one paragraph)**: Generate a tiny typed "greeting" export for a named
audience — the smallest possible primitive that proves the intent → interview →
promote → compose loop end to end.

> Golden fixture for 004 US1: this brief + the expected drafted schema/template
> (see `expected-draft.ts`) are what `grammar.specify`/`clarify`/`author` should
> produce. The deterministic tests stage that expected draft and assert
> inertness, the quality gate, and promote → compose.

## Candidate primitives

### Greeting

- **intent**: Emit a typed greeting function for a named audience.
- **whenToUse**: When a module needs a simple, named greeting export.
- **whenNotToUse**: Use a full i18n primitive for localized, pluralized copy.
- **fields / props**:
  - `name`: string (min 1) — the audience being greeted; becomes the export suffix.
- **composition rules**: top-level (emits a file). No child slots.
- **output mapping**: `src/greetings/<id>.ts`, language `ts`.
- **decomposition note**: trivially within the 30-line discipline.
- **example**: `{ "primitive": "Greeting", "id": "world", "name": "World" }`

## Composition shape

A single root primitive (`Greeting`). No nesting; no slots.

## Open questions / deferrals

- None — deliberately minimal.

## Clarifications

### Session 2026-05-30

- Q: Is `name` required or optional? → A: required (a greeting needs an audience).
- Q: Top-level file or inline child? → A: top-level — it emits its own module.
