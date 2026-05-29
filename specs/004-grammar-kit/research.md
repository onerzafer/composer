# Research: Grammar-kit

Phase 0 output. The four highest-impact unknowns were resolved by `/speckit-clarify` (Session 2026-05-29); they are recorded here as decisions with rationale, plus the design decisions that follow from them.

## Decision 1 — Delivery: AI skills + composer CLI (clarified)

- **Decision**: The phases are authoring-time **AI skills** (Markdown prompt files + path-resolving scripts + per-artifact templates + a manifest — the exact packaging spec-kit uses for its own commands), run in the developer's coding agent. The deterministic parts — staging a draft, the `promote` gate, and the quality report — are **composer CLI** commands.
- **Rationale**: Mirrors the split that already works in this repo (spec-kit skills + composer CLI). The interview/drafting genuinely benefit from an adaptive LLM; the gate and checks must be deterministic and reproducible. Crucially, this adds **no tool to the composer MCP/agent surface** (Constitution IV) — the skills run in the *developer's* agent at authoring time, not in the composer runtime agent.
- **Alternatives rejected**: *CLI-only* (a scripted questionnaire is a weaker, non-adaptive interview); *AI-skills-only* (the accept/quality gate would have no deterministic CLI enforcement).

## Decision 2 — Reuse 003's staging + `promote` gate (clarified)

- **Decision**: `004` reuses `003`'s staging directory (`design/catalog/ingested/`, already engine-ignored) and its `promote` command; it builds **no second gate**. Build order is `003` → `004`.
- **Rationale**: One gate, one mechanism, one verb — forward (intent→grammar) and reverse (code→grammar) authoring assists converge on the same human-owned activation. Matches the committed stack order (`003` before `004`). Avoids premature abstraction.
- **Alternatives rejected**: *004 standalone gate* (duplicates `003`); *extract a shared gate module now* (premature given the stack order — revisit only if a third consumer appears).

## Decision 3 — Full phase set in v1, clarify as centerpiece (clarified)

- **Decision**: v1 ships `grammar.specify / clarify / plan / tasks / author / checklist`. Each phase is thin; the value concentrates in the `clarify` interview.
- **Rationale**: The phases reinforce one another (a brief feeds clarify feeds the catalog design feeds drafting), and shipping the whole loop is what makes the workflow usable end-to-end rather than a fragment.
- **Alternatives rejected**: *MVP (clarify+author+promote+quality only)* and *interview-only* — clarified against.

## Decision 4 — One activation verb: `promote` (clarified)

- **Decision**: `promote` is the single verb for a human activating a staged draft into the catalog, shared by `003` (ingest) and `004` (authoring).
- **Rationale**: One word for one concept ("a human activates a staged draft"); avoids `accept`/`promote` drift across two features that share the gate.
- **Alternatives rejected**: distinct `accept` (authoring) vs `promote` (ingest).

## Decision 5 — A grammar-specific clarify taxonomy (design)

- **Decision**: `grammar.clarify` uses an ambiguity taxonomy specialized for grammar authoring — analogous to spec-kit's clarify taxonomy but Composer-flavored: **primitive boundary** (what is one primitive), **fields/props** (the schema), **composition rules** (slot/child constraints), **output mapping** (file vs inline, paths), **naming**, **decomposition** (30-line discipline), and **total-functional** (reject control-flow shapes). Questions are recommend-first, ≤5 per round, written back into the vocabulary brief.
- **Rationale**: This is the Composer-specific guidance content and where the feature's value lives. The interview *engine* is reusable from spec-kit; only the taxonomy + templates are new.
- **Alternatives rejected**: reuse spec-kit's product/feature taxonomy verbatim (wrong domain — it asks about user journeys/NFRs, not primitive boundaries/slots/decomposition).

## Decision 6 — Quality report reuses/extends `composer doctor` (design)

- **Decision**: The pre-`promote` quality report reuses `doctor`'s existing checks (drift, primitive sprawl, 30-line, naming hygiene, and bijection-in-CI) and adds **metadata completeness** (`whenNotToUse` + ≥1 example) and an explicit **total-functional** check (no control-flow primitive).
- **Rationale**: Don't duplicate `doctor`; extend it so authoring-time and ongoing health use one report.
- **Alternatives rejected**: a separate, parallel checker (duplication + drift between two reports).

## Decision 7 — Testing strategy (design)

- **Decision**: Unit/integration-test the **deterministic path** (author→stage→`promote`→`compose`) and the quality report; ship a **golden fixture** (a vocabulary brief → expected draft) for the author phase. The interview phases are prose skills, validated by **example transcripts** and the golden brief, not by unit tests.
- **Rationale**: An LLM interview is not deterministically unit-testable; what *is* testable is the artifacts it produces and the gate that follows. This keeps the bijection/atomic/gate guarantees under test while accepting that the prose phases are reviewed, not asserted.
