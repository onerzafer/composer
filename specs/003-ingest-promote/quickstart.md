# Quickstart: ingest → review → promote

## The loop (post-implementation)

```bash
# 1. Derive a candidate primitive from an existing React component (CLI-only).
composer ingest react src/components/Card.tsx
#    → writes design/catalog/ingested/card.draft.ts (+ .hbs). Engine ignores it.
#    → discover / scaffold / compose are UNCHANGED at this point.

# 2. Review the draft: add whenToUse / whenNotToUse / semantic rules that
#    an auto-derivation cannot infer. (Human step — this is the gate.)

# 3. Promote it into the live catalog.
composer promote card.draft.ts
#    → moves it to design/catalog/primitives/ ; now composable like any primitive.

# 4. Use it (CLI or agent) — e.g. inline inside a page spec — and compose.
composer compose home          # a spec referencing Card now emits real source
```

## Validation checklist

1. **Inertness (SC-002)** — with a draft present in quarantine, `discover`/`scaffold`/`compose` behave identically to no-draft.
2. **Promote (FR-002/FR-007)** — `promote` moves the draft to live; a name collision is refused with a clear message.
3. **Gate (FR-003/SC-004)** — there is no MCP `ingest`/`promote` tool; the agent cannot activate a primitive. Activation is reachable only via human `promote`.
4. **Bijection (FR-009/SC-003)** — for a paired adapter+ingester, ingest → compose → re-ingest reproduces the JSON.
5. **Pluggable parser (SC-005)** — a second ingester (non-TS, tree-sitter backend) is authorable against the SDK with no engine change.
6. **30-line discipline (FR-010)** — `composer doctor` flags an oversized derived/promoted template instead of accepting it silently.
