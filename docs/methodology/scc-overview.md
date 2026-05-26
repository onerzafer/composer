# Schema-Compiled Composition (SCC) — Overview

Composer is the reference toolkit for **Schema-Compiled Composition**, the methodology described in the project [README](../../README.md).

This document is a pointer + glossary for adopters who land here from npm or a tutorial. The README is the authoritative source for the methodology; the [constitution](../../.specify/memory/constitution.md) is the authoritative source for the implementation rules.

---

## The core loop

```
agent (LLM)              composer.json          generated source
   │                        │ extends:             │
   │                        │ @composer/adapter-…  │
   ▼                        ▼                     ▼
discover ─► scaffold ─► compose ─► (atomic write) ─► page.tsx, etc.
                             │
                             ▼
                       JSON spec at design/specs/<id>.json
```

1. **discover** — agent learns the project's primitives, intents, and design tokens (no schemas yet, ≤5,000 tokens).
2. **scaffold** — agent picks a primitive and gets its full Zod schema + canonical examples + field guidance + what-not-to-use list.
3. **compose** — agent submits JSON; engine validates structurally, semantically, audits cross-spec rules, drift-checks any pre-existing outputs, and atomically writes the spec + generated source.

Everything outside step (3) is human-authored. The agent **never** writes source.

---

## Three Surfaces, One Owner Each

| Surface | Owner | Location | Mutation rule |
|---|---|---|---|
| **Catalog** (primitives + templates + rules) | Humans | `<workspace>/catalog/`, `<workspace>/templates/`, `<workspace>/output.map.ts` | Hand-authored TypeScript + Handlebars; reviewed in code review like any other code. |
| **Composition** (specs) | LLM | `<workspace>/specs/*.json` | Written exclusively via the engine's `compose` endpoint; never edited by hand. |
| **Compiler** (engine) | `@composer/core` | `node_modules/` | Authored once by the toolkit, deployed as a library. |

The MCP surface is fenced into surface 2: agents see exactly 4 tools (`discover`, `scaffold`, `validate`, `compose`) — no list, read, or freeform file-write tools.

---

## Atomic compose

A single `compose("<spec_id>", json)` invocation is all-or-nothing across:
- structural validation (Zod parse)
- semantic validation (cross-primitive rules)
- audit (parent's `audit.ts` + project's `audit.ts`, parent first)
- render-to-staging (Handlebars per primitive)
- drift detection (hash compare against the existing file)
- atomic write (spec + outputs + sourcemap + hash store)

Any failure → no spec saved, no file touched. The workspace lockfile (`.composer/cache/compose.lock`) serializes compose at the workspace level; multi-agent attach is supported via shared lock, not via concurrent writes.

---

## Drift detection

After each compose, the engine records SHA-256 hashes of every output it wrote. On the next compose, if any output's on-disk hash diverges from the recorded one, the engine **aborts** with a unified diff and two remediation options:

1. Revert the hand-edit: `git checkout -- <file> && composer compose <spec>`
2. Lift the change into the spec or template, then re-run.

This is the difference between a codegen tool you trust and one your team learns to avoid (README §10 failure mode #4).

---

## Glossary

- **Adapter** — npm package that bundles a catalog + templates + output map + (optional) audit + (optional) bootstrap. Targets one ecosystem (e.g., Next.js, Rails, key/value config files). Authored via `defineAdapter()` from `@composer/adapter-kit`.
- **Catalog** — the set of primitives a workspace knows about. Lives in `<workspace>/catalog/` plus any `extends:`-inherited primitives. Each primitive is a strict Zod object + `<Name>Meta` with intent/whenToUse/fieldGuidance/examples.
- **Compose** — the engine's atomic write pipeline. Both an MCP tool and a CLI subcommand.
- **Discover** — the agent's first MCP call. Returns the project overview (catalog primitives, specs, tokens, guidelines) under 5,000 tokens.
- **Drift** — a generated file whose on-disk content no longer matches the engine's recorded hash. Always aborts the next compose.
- **Extends** — the `extends:` field in `composer.json`. References a published adapter that contributes catalog + templates + output map + audit, layered underneath the project's content.
- **Output map** — `output.map.ts` declares which primitives emit files and where (`byPrimitive[<name>] → OutputPath[]`). A primitive without an entry is *embedded* (rendered inline by its parent's template).
- **Prep** — `*.prep.ts` companion to a template, pre-computing view data inside a sandboxed VM. Loader wiring lands in v0.2; the sandbox itself is already implemented.
- **Primitive** — a single Zod object representing a renderable unit (Hero, Card, Page, Form, …). All primitives share the discriminator field `primitive`.
- **Scaffold** — the agent's second MCP call. Returns a starter skeleton + the primitive's full schema + field guidance + examples + the `whenNotToUse` list.
- **Slot** — a variant of a primitive (e.g., a Hero in "centered" vs "overlay" mode). Declared in the slot registry, dispatched via the `slot` Handlebars helper.
- **Source map** — `.composer/cache/sourcemap.json`. Bi-directional index for `composer explain` (code→spec) and `composer trace` (spec→code).
- **Spec** — a JSON document in `<workspace>/specs/<id>.json`. The single source of truth for what the agent composed.
- **Workspace** — the folder pointed to by composer.json's `workspace:` field (typically `./design`). Contains catalog + templates + specs + the `.composer/` engine cache.

---

## Reading order for new adopters

1. [`README.md`](../../README.md) — methodology + motivation
2. [`specs/001-composer-toolkit-v0/quickstart.md`](../../specs/001-composer-toolkit-v0/quickstart.md) — 5-minute walkthrough
3. [`docs/adapters/authoring.md`](../adapters/authoring.md) — write your own adapter
4. [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — the rules the engine enforces
5. [`docs/v0.2-deferrals.md`](../v0.2-deferrals.md) — what's intentionally not in v0.1
