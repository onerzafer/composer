# Implementation Plan: Grammar-kit — guided, human-owned vocabulary authoring

**Branch**: `004-grammar-kit` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-grammar-kit/spec.md` (clarified 2026-05-29)

## Summary

Composer ships the *runtime* skills (`discover`/`scaffold`/`validate`/`compose`) but nothing that guides authoring the human-owned **grammar** (catalog primitives = Zod schema + metadata + template + output-map). Grammar-kit closes that gap by mirroring spec-kit one level down: a guided, AI-assisted, human-owned workflow — `grammar.specify → clarify → plan → tasks → author → checklist` — that interviews the human, drafts the grammar into staging, and lets a human **`promote`** it into the live catalog. Per clarifications: the **full phase set** ships in v1; it is delivered as **authoring-time AI skills + composer CLI** (no new composer MCP tool); it **reuses `003`'s staging + `promote` gate** (so build order is `003` → `004`); and **`promote`** is the single activation verb shared with `003`.

## Technical Context

**Language/Version**: TypeScript 5.x / Node ≥ 20 for the CLI parts; the skills are Markdown prompt files + bash scripts (the spec-kit packaging pattern).

**Primary Dependencies**: `@composer/ingest-kit` (from `003`) for the staging dir + `promote` gate; `@composer/core` `doctor` for the quality report; the spec-kit-style scaffolding pattern (path-resolving scripts + per-artifact templates + a manifest) as the model for packaging the grammar-kit skills.

**Storage**: filesystem — vocabulary briefs + primitive drafts in the `003` staging area (`design/catalog/ingested/`), promoted output in `design/catalog/primitives/` (+ templates).

**Testing**: vitest for the deterministic path (stage → promote → compose) and the quality report; a golden "brief → draft → promote → compose" e2e fixture. The interview phases are prose skills, validated by example transcripts/fixtures rather than unit tests.

**Target Platform**: a distributable authoring skill pack + CLI extensions in the monorepo; consumed by an adapter author / adopter in their own coding agent.

**Project Type**: meta-tooling (new package) layered on `001`'s engine and `003`'s ingestion.

**Performance Goals**: authoring-time, interactive — not a hot path. Correctness (the gate holds; quality checks are sound) over speed.

**Constraints**: NO new tool on the composer MCP/agent surface (Constitution IV); all grammar change behind a human `promote`; the workflow must steer toward 30-line decomposition (V) and away from control-flow primitives (VIII); catalog authoring stays TS/Zod (IX).

**Scale/Scope**: full phase set, but each phase is thin — the value concentrates in `grammar.clarify` (the interview taxonomy) and the `promote`/quality reuse. No new runtime engine code.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Impact | Status |
|---|---|---|
| I. Schema-Compiled Composition (LLM never writes code) | Preserved — the AI *drafts* grammar for a human; a human `promote`s it. The LLM never authors the live grammar; it guides a human who does. | PASS |
| II. Three Surfaces, One Owner Each | Preserved — catalog stays human-owned; `promote` is the human act that changes it; drafts are inert. | PASS |
| IV. No Escape Hatches on the Agent Surface | Preserved — grammar-kit is authoring-time AI skills (run in the developer's agent) + composer CLI; it adds NO tool to the composer MCP server. The runtime agent surface (`discover`/`scaffold`/`validate`/`compose`) is unchanged. | PASS |
| V. 30-Line Discipline | **Enforced** — the clarify interview steers decomposition and the quality gate flags oversized templates. | PASS |
| VI. Drift Detection | Unaffected — promoted primitives obey the same drift rules. | PASS |
| VII. Custom Adapters Are First-Class | **Reinforced** — makes authoring a catalog/adapter a guided, first-class workflow. | PASS |
| VIII. Total Functional Language | **Enforced** — the interview steers away from control-flow primitives; the quality gate flags them. | PASS |
| IX. TypeScript / Zod Catalog Authoring | Preserved — the AI drafts TS/Zod; the human owns/accepts it. | PASS |
| X. The Catalog Is the API | **Reinforced** — the workflow's job is to populate the single catalog-as-API record (`intent`/`whenToUse`/`whenNotToUse`/`fieldGuidance`/`examples`) well. | PASS |

No violations → Complexity Tracking not required. (Auto-grow / meta-primitives / compose-time grammar mutation are explicitly out of scope; the human `promote` gate is the boundary.)

## Project Structure

### Documentation (this feature)

```text
specs/004-grammar-kit/
├── plan.md, spec.md, research.md, quickstart.md
├── contracts/grammar-kit-cli.md   # the grammar.* skill set + composer CLI surface + brief/draft artifact shapes
├── checklists/requirements.md
└── tasks.md            # created by /speckit-tasks
```

### Source Code (repository root)

```text
packages/grammar-kit/                      # NEW — the distributable authoring pack (depends on @composer/ingest-kit, @composer/core)
  skills/                                  #   grammar.specify / clarify / plan / tasks / author / checklist (Markdown prompt files, spec-kit-style)
  templates/                               #   vocabulary-brief.md, catalog-design.md (per-artifact templates)
  taxonomy/                                #   the clarify ambiguity taxonomy specialized for grammar authoring
  scripts/                                 #   path-resolution + setup scripts (model: .specify/scripts)
  manifest.json                            #   install manifest (model: .specify integrations)
  src/                                     #   thin CLI helpers: stage a draft, run the quality report
packages/cli/src/commands/
  grammar.ts                               # NEW — `composer grammar <phase>` router for the deterministic helpers + quality
                                           #   (activation reuses `composer promote` from 003; no new gate)
packages/core/src/                         # doctor extended (or wrapped) for the pre-promote quality report (bijection/30-line/metadata/total-functional)

tests/
  integration/grammar-author-stage.test.ts # NEW — author drafts to staging; staging inert until promote
  integration/grammar-promote-compose.test.ts # NEW — promote a drafted primitive (via 003 gate) then compose it
  contract/grammar-quality.test.ts          # NEW — quality report flags 30-line / missing-metadata / control-flow
  fixtures/grammar-kit/                      # NEW — a golden vocabulary brief + expected draft
```

**Structure Decision**: One new package (`grammar-kit`) carrying the AI skills + templates + taxonomy + thin CLI helpers, plus a `composer grammar` CLI router and a doctor-based quality report. It **depends on `003`'s `ingest-kit`** for the staging dir and `promote` gate (no second gate is built), so the implementation is sequenced after `003`. The engine/runtime is untouched.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty. The sequencing dependency on `003` is a deliberate reuse decision (recorded in research.md), not a complexity exception.
