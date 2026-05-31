# Grammar Clarify Taxonomy

The ambiguity taxonomy `grammar.clarify` scans, specialized for **authoring a
Composer vocabulary** (not products/features — that is spec-kit's domain). Each
category below is a place a primitive design is commonly under-specified. The
interview asks **recommend-first, ≤5 questions per round**, highest-impact first,
and writes every accepted/overridden answer into the brief's `## Clarifications`
log.

Categories marked **[gated]** are also enforced mechanically by
`composer grammar check` (constitution V / VIII / X) — clarify steers the design
so the draft will pass that gate, rather than discovering the failure later.

## 1. Primitive boundary

*What is exactly one primitive?* Is this one primitive or several? Does it
conflate a container with its items? Recommended default: one primitive = one
cohesive, independently-composable unit with a single output responsibility.

## 2. Fields / props (the schema)

*What is the typed contract?* Which fields are required vs optional? Their types
(string/number/enum/array/nested)? Any refinements (min length, regex, format)?
Recommended default: the minimal field set that makes the primitive renderable;
push everything else to composition.

## 3. Composition rules (slots / children)

*How does it nest?* Is it a top-level root (emits a file) or an inline child of a
parent template? Which slot families may it host, and which variants? Recommended
default: leaf primitives are inline; only page/document-level primitives are roots.

## 4. Output mapping

*Where does its code go?* A file path pattern + language, or inline (rendered by
the parent, no `byPrimitive` entry)? Recommended default: roots map to a path;
children are inline.

## 5. Naming **[gated]**

*What is it called?* PascalCase, domain-meaningful, and — enforced — **never a
control-flow word** (`if`, `while`, `for`, `switch`, `when`, …). A control-flow
name signals a control-flow primitive, which the total-functional rule forbids.

## 6. Decomposition (30-line discipline) **[gated]**

*Will the template stay ≤30 lines of pure substitution?* If a primitive's
template needs branching logic or grows past one screen, which smaller primitives
should it split into? Recommended default: decompose at the first sign of a
template doing more than substitution.

## 7. Total-functional shape **[gated]**

*Does the request smuggle in control flow?* If the human wants conditionals or
loops, steer to a **declarative** encoding — a fixed `forEach { over, template }`
iteration model, or an enum/variant field — never an `if`/`while` primitive
(constitution VIII). Iteration is data, not control.

## 8. Metadata (catalog-is-the-API) **[gated]**

*Is the human's intent captured for the agent?* Every primitive needs a real
`intent`, a `whenToUse`, **≥1 `whenNotToUse`**, `fieldGuidance` per field, and
**≥1 `example`** — these are what the composing agent sees in `scaffold`
(constitution X). The gate refuses TODO/empty metadata.

## Interview rules

- Recommend-first: every question carries a recommended answer the human accepts or overrides.
- ≤5 questions per round; stop early when the high-impact ambiguities are resolved.
- Undecidable answers are marked and deferred — never guessed silently.
- A drafted primitive that would violate a MUST principle is flagged as blocking before promote.
