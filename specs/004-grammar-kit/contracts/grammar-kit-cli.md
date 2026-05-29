# Contracts: grammar-kit surface

Two interface surfaces: **AI skills** (authoring-time, run in the developer's agent) and **composer CLI** commands (deterministic). Plus the artifact shapes they exchange. None of this touches the composer MCP/agent runtime surface (Constitution IV).

## AI skills (Markdown prompt files, spec-kit-style packaging)

| Skill | Input | Output | Notes |
|---|---|---|---|
| `grammar.specify` | NL intent ("generate X for framework Y") | vocabulary brief (draft) | candidate primitives + intents + composition shape + slots + output paths |
| `grammar.clarify` | the brief | brief, updated in place | recommend-first, ≤5 Qs/round; grammar taxonomy (boundary/props/composition/output/naming/decomposition/total-functional); writes a `## Clarifications` log |
| `grammar.plan` | the brief | catalog design doc | discriminated-union shape, per-primitive Zod fields, slot registry, output.map plan, template plan |
| `grammar.tasks` | the design | authoring task list | per-primitive: schema → template → output.map entry → audit rule → fixture → bijection test |
| `grammar.author` | the design + tasks | primitive draft(s) in staging | drafts Zod schema + `.hbs` template + metadata; writes ONLY to `design/catalog/ingested/`; never activates |
| `grammar.checklist` | a draft (or catalog) | quality report (advisory) | wraps `composer grammar check`; read-only |

## composer CLI (deterministic)

| Command | Effect | Exit-code contract |
|---|---|---|
| `composer grammar <phase> [...]` | router/helpers for the deterministic side of each phase (e.g., scaffold a brief file, stage a draft) | 0 ok; non-zero on validation error |
| `composer grammar check <draft|catalog>` | pre-`promote` quality report: bijection round-trip, 30-line discipline, `whenNotToUse` + ≥1 example, schema↔template↔output-map↔meta coherence, no control-flow primitive | 0 = all pass; non-zero = at least one failing check (lists them) |
| `composer promote <draft>` | **reused from `003`** — the human gate; moves a staged draft into `design/catalog/primitives/`; refuses name collisions | per `003` contract |

No new MCP tool is registered; `discover`/`scaffold`/`validate`/`compose` are unchanged.

## Artifact shapes

- **Vocabulary brief** — a Markdown doc (template: `vocabulary-brief.md`): per candidate primitive its intent, `whenToUse`/`whenNotToUse`, fields/props, composition rules (slots/children), output mapping, naming, decomposition notes, and a `## Clarifications` log. Reviewed by the human; not loaded by the engine.
- **Primitive draft** — the `003` draft shape (Zod schema `.ts` + `.hbs` template + metadata stub) in the staging dir. Inert until `promote`.
- **Quality report** — structured pass/fail per check (bijection / 30-line / metadata / coherence / total-functional), suitable for both human review and CI.

## Invariants (must hold)

1. Nothing in `grammar.*` activates a primitive; only `composer promote` (human) changes the live catalog.
2. Drafts in staging never affect `discover`/`scaffold`/`compose`.
3. No control-flow primitive and no >30-line template can be promoted without an explicit human override.
4. The composer MCP/agent tool set is unchanged by this feature.
