---
name: grammar.checklist
description: Run composer grammar check against a draft as an advisory pre-promote quality report, explaining each check (30-line, total-functional, metadata, coherence, bijection-in-CI) and what promote will refuse. Read-only.
---

# grammar.checklist

Wrap `composer grammar check` as an **advisory** pre-promote quality report. This
phase is **read-only**: it runs the deterministic checker and explains the
findings so the human can decide. It writes nothing, edits no draft, and — like
every grammar phase — **never promotes**. Activation is a human running
`composer promote`.

## Steps

1. Resolve paths if you need them:
   `bash packages/grammar-kit/scripts/bash/grammar-paths.sh --json`
   (or `composer grammar paths`) to confirm `STAGING_DIR` and the draft name.
2. Run the checker against the staged draft (or the whole catalog):

   ```bash
   composer grammar check <draft>
   ```

   - **Exit 0** = every check passed; the draft is promotable.
   - **Non-zero** = at least one check failed; the output lists which. Treat this
     as blocking, not cosmetic.

3. Relay the report and **explain each check** so the human knows what to fix:

   - **30-line discipline** (constitution V) — the template renders in ≤30 lines
     of pure substitution. A failure means the primitive does too much; the fix
     is **decomposition** into smaller primitives (back to `grammar.plan` /
     `grammar.clarify`), not a longer template.
   - **Total-functional / no control-flow** (constitution VIII) — no primitive is
     named after or shaped like a control-flow construct (`if`/`while`/`for`/
     `switch`/`when`). Iteration must be declarative (a fixed `forEach`-style
     primitive over an array field). A failure means a control-flow primitive
     slipped in; re-encode it declaratively.
   - **Metadata completeness** (constitution X) — every primitive has a real
     `intent`, a `whenToUse`, ≥1 `whenNotToUse`, `fieldGuidance` per field, and
     ≥1 `example`. The gate refuses TODO/empty metadata, because this metadata is
     the API the composing agent reads in `scaffold`.
   - **Coherence** — schema ↔ template ↔ output-map ↔ metadata agree: every
     schema field is used (or intentionally omitted), every template placeholder
     maps to a field, roots have a `byPrimitive` output entry and inline children
     don't.
   - **Bijection (round-trip)** — a composed instance reads back to the same
     data. The full bijection round-trip is enforced **in CI**; `composer grammar
     check` reports the locally-checkable surface of it.

4. **Explain the promote gate.** Make clear that `composer promote <draft>` treats
   this report as a **blocking precondition**: a draft that fails any check is
   **refused unless `--force`** — and `--force` **records the overridden
   findings** rather than hiding them. Recommend fixing failures over forcing
   them; `--force` is for a deliberate, documented human override, not for
   skipping real problems. Promote also refuses a name collision with the live
   catalog.

## Output

Summarize: pass/fail per check, the specific findings, and a recommendation —
either "ready: a human may review and run `composer promote <draft>`" or "not
ready: fix <findings>, then re-run `grammar.checklist`". Do not promote, do not
edit the draft, and do not run `--force` on the human's behalf.
