# Catalog Design: [FEATURE/TARGET NAME]

**Source brief**: [vocabulary-brief.md]
**Created**: [DATE]

> Output of `grammar.plan`: the concrete shape `grammar.author` drafts into staging.
> Catalog authoring is TypeScript/Zod (constitution IX).

## Discriminated union

```ts
export const PrimitiveNode = z.discriminatedUnion("primitive", [
  // [Primitive1, Primitive2, ...]
]);
```

## Per-primitive design

### [PrimitiveName]

- **Zod schema** (fields + refinements):

  ```ts
  export const [PrimitiveName] = z.object({
    primitive: z.literal("[PrimitiveName]"),
    id: z.string(),
    // [field]: z.[type](),  // + .min()/.regex()/.optional() as the brief dictates
  }).strict();
  ```

- **Metadata** (catalog-is-the-API — constitution X; ALL fields real, no TODOs):
  - `intent`, `whenToUse`, `whenNotToUse: [...]` (≥1), `fieldGuidance: {...}`, `examples: [...]` (≥1)
- **Template** (`templates/[name].[lang].hbs`, ≤30 lines — constitution V):
  - [substitution sketch; if >30 lines, list the child primitives to split into]
- **Output map**: [`byPrimitive` entry → path + language, OR inline (omit — parent renders it)]
- **Slots / children**: [which slot family / which children it hosts, if any]
- **Audit rule**: [cross-spec invariant, if any]

<!-- repeat per primitive -->

## Slot registry

[family → variant → { importPath, exportName } rows, if the design uses slots.]

## Quality plan

Each drafted primitive must pass `composer grammar check` before `promote`:
30-line, total-functional (no control-flow name), metadata completeness
(intent + whenNotToUse + ≥1 example), schema↔template coherence. (`promote`
refuses a failing draft unless `--force`.)
