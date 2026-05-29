# Quickstart: guided grammar authoring (intent → promote → compose)

## The loop (post-implementation)

```text
# Authoring-time AI skills (run in your coding agent):
grammar.specify   "I want to generate <X> for <framework Y>"
                  → a vocabulary brief: candidate primitives, intents, composition shape, slots, output paths
grammar.clarify   → recommend-first ≤5-question interview pins primitive boundaries, props,
                    composition rules, output mapping, naming, and where to decompose (30-line)
grammar.plan      → catalog design: discriminated-union shape, per-primitive Zod fields, slot registry, output.map, template plan
grammar.tasks     → per-primitive authoring task list
grammar.author    → AI DRAFTS the Zod schema + template + metadata into the staging dir (design/catalog/ingested/)
                    — inert: discover/scaffold/compose are unaffected

# Deterministic composer CLI:
composer grammar check <draft>   # quality report: bijection, 30-line, whenNotToUse + example, coherence, no control-flow
# (human reviews/edits the draft, then:)
composer promote <draft>         # the 003 gate — the ONLY step that changes the live catalog
composer compose <spec>          # the newly promoted primitive composes like any other
```

## Validation checklist

1. **Interview (FR-002 / SC-005)** — `grammar.clarify` asks ≤5 recommend-first questions per round and writes answers into the brief.
2. **Staging inert (FR-003 / SC-003)** — with a draft in staging, `discover`/`scaffold`/`compose` behave identically to no-draft.
3. **Gate (FR-004 / SC-004)** — a draft enters the catalog ONLY via `composer promote`; no composer MCP/agent tool was added; the runtime agent surface is unchanged.
4. **Quality (FR-006/FR-007 / SC-002)** — `composer grammar check` flags an oversized (30-line) template, missing `whenNotToUse`/example, incoherent schema↔template, and any control-flow primitive; nothing failing is promoted without an explicit override.
5. **End-to-end (SC-001)** — a developer who has never hand-authored a primitive goes intent → interview → `promote` → `compose` emits source, with no from-scratch TS/Zod hand-authoring.
6. **One verb** — the same `promote` activates drafts from both `003` (ingest) and `004` (authoring).
7. **Reuse / sequencing** — `004` uses `003`'s staging + `promote`; it is built after `003`.
