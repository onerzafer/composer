# Authoring a Vocabulary with grammar-kit

Composer ships the *runtime* (`discover` / `scaffold` / `validate` / `compose`)
but the human-owned **grammar** — the catalog of primitives (Zod schema +
metadata + template + output map) — has, until now, been unguided manual work.
**grammar-kit** is the guided, AI-assisted, human-owned workflow for authoring
that grammar. It is the *forward* complement (intent → grammar) of
[ingestion](./ingesting.md)'s *reverse* path (existing code → grammar); both feed
one human-owned catalog through one human **`promote`** gate.

The load-bearing rule is the same as ingestion's: **the AI drafts; the human
decides and owns.** The AI interviews you and drafts schemas+templates into a
staging area; nothing enters the live catalog until *you* run `composer promote`.

---

## The loop

```text
# Authoring-time AI skills (run in your coding agent):
grammar.specify   "I want to generate <X> for <framework Y>"
                  → a vocabulary brief (candidate primitives, intents, composition shape, slots, output paths)
grammar.clarify   → recommend-first ≤5-question interview pins primitive boundaries, props,
                    composition rules, output mapping, naming, and where to decompose (30-line)
grammar.plan      → catalog design (discriminated union, per-primitive Zod fields, slots, output.map, templates)
grammar.tasks     → per-primitive authoring task list
grammar.author    → AI DRAFTS the Zod schema + template + metadata into staging (design/catalog/ingested/)
                    — inert: discover/scaffold/compose are unaffected

# Deterministic composer CLI:
composer grammar check <draft>   # quality report: 30-line, total-functional, metadata, coherence, bijection-in-CI
# (you review/edit the draft, then:)
composer promote <draft>         # the gate — the ONLY step that changes the live catalog
composer compose <spec>          # the newly promoted primitive composes like any other
```

The skills are delivered as a **skill pack** (install them into a project with
`packages/grammar-kit/scripts/bash/install.sh`); the deterministic gate and
checks are `composer` CLI commands. **No tool is added to Composer's MCP/agent
runtime surface** — the runtime agent still sees only the four workflow tools
(constitution IV).

---

## The clarify interview (the centerpiece)

`grammar.clarify` is where the value concentrates. It runs a **recommend-first,
≤5-questions-per-round** interview over a grammar-specific ambiguity taxonomy:

| Category | What it pins down | Gated by `grammar check`? |
|---|---|---|
| Primitive boundary | what is exactly one primitive | — |
| Fields / props | the Zod schema | — |
| Composition rules | slots / children / root-vs-inline | — |
| Output mapping | file path + language, or inline | — |
| Naming | PascalCase, never a control-flow word | ✓ (VIII) |
| Decomposition | template stays ≤30 lines | ✓ (V) |
| Total-functional | no `if`/`while`/`for` primitives — iteration is declarative | ✓ (VIII) |
| Metadata | real intent + whenNotToUse + ≥1 example | ✓ (X) |

Every question offers a recommended answer you accept or override; each decision
is written into the brief's `## Clarifications` log. Undecidable answers are
marked and deferred, never guessed.

---

## The quality gate

`composer grammar check <draft>` grades a staged draft against the
mechanically-checkable per-primitive constitution principles:

- **30-line discipline** (V) — template ≤ 30 lines, else "needs decomposition". *(blocking)*
- **Total-functional** (VIII) — the primitive is not a control-flow shape. *(blocking)*
- **Metadata completeness** (X) — real `intent` + `whenNotToUse` + ≥1 `example`. *(blocking)*
- **Schema ↔ template coherence** — every field is rendered. *(advisory warning)*
- **Bijection round-trip** — the full JSON→code→JSON check runs in CI. *(informational)*

`promote` treats the blocking checks as a **precondition**: a draft that fails is
refused unless you pass `--force` (which promotes anyway and records the
overridden findings). Because `promote` is the gate **shared with ingestion**,
this precondition protects ingested drafts too.

The architectural principles (I, II, IV) are *not* mechanical per-primitive
properties — they are upheld by your review at the `promote` gate, not by an
automated check.

---

## What stays out of reach

- **The agent cannot author or promote grammar.** grammar-kit is authoring-time
  skills in *your* agent + the `composer` CLI; it adds no MCP tool (SC-004).
- **No auto-grow.** The grammar never changes during compose; only a human
  `promote` changes it.
- **One verb.** `promote` activates drafts from both ingestion (003) and
  authoring (004) — one word, one gate, one human-owned catalog.

---

## Further reading

- Reverse path — ingesting existing code: [`docs/adapters/ingesting.md`](./ingesting.md)
- Adapter authoring (the catalog's forward codec): [`docs/adapters/authoring.md`](./authoring.md)
- Constitution: `.specify/memory/constitution.md`
- Feature spec: `specs/004-grammar-kit/spec.md`
