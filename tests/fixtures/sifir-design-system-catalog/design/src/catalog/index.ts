// Trimmed stand-in for @sifir/design-system's `src/catalog/index.ts`.
//
// The real file is ~9.7k lines across 9 modules (macros.ts, atoms.ts,
// layout.ts, forms.ts, shared.ts, decorators.ts, decorator-vocabulary.ts,
// addons.ts, slot-registry.ts) defining 58 primitives, most of it reached
// through `@/registry/...` tsconfig path aliases and pulling in the design
// system's full component tree (icon libraries, gsap, motion, react, …) —
// none of which is relevant to the bug this fixture reproduces.
//
// What DOES matter, and what this file preserves exactly: `PrimitiveNode`
// is a flat `z.discriminatedUnion("primitive", [...])` over real primitive
// names spanning every category (macro, layout-with-recursive-children,
// atom, form), built with Zod v4 (resolved via this fixture's own
// `design/node_modules/zod` symlink — see
// tests/integration/sifir-catalog-zod-v4.test.ts). The sibling
// `../../catalog/index.ts` (one directory up) is a byte-for-byte copy of
// the REAL `@sifir/design-system/catalog/index.ts` — the file the reported
// bug names — and spreads this union's `.options` into its own top-level
// `PrimitiveNode`, exactly reproducing the "discriminated union built from
// another discriminated union's options, under Zod v4" shape that tripped
// up @composer/typescript's compile step.
import { z } from "zod";

export const HeroSectionSchema = z
  .object({
    primitive: z.literal("HeroSection"),
    props: z.object({
      heading: z.string(),
      ctas: z
        .array(z.object({ label: z.string(), href: z.string() }))
        .optional(),
    }),
  })
  .strict();

export const CtaSectionSchema = z
  .object({
    primitive: z.literal("CtaSection"),
    props: z.object({
      heading: z.string(),
      tier: z.enum(["page", "sub"]).optional(),
      ctas: z
        .array(z.object({ label: z.string(), href: z.string() }))
        .optional(),
    }),
  })
  .strict();

export const HeroSchema = z
  .object({
    primitive: z.literal("Hero"),
    id: z.string(),
  })
  .strict();

export const ButtonSchema = z
  .object({
    primitive: z.literal("Button"),
    id: z.string(),
    label: z.string(),
  })
  .strict();

export const FormSchema = z
  .object({
    primitive: z.literal("Form"),
    id: z.string(),
  })
  .strict();

export const TextFieldSchema = z
  .object({
    primitive: z.literal("TextField"),
    id: z.string(),
    name: z.string(),
  })
  .strict();

// Section/Container carry recursive `children` — mirrors the real
// `src/catalog/layout.ts` + `_registerPrimitiveNodeForRecursion` wiring
// (needed there to break a circular import); a direct `z.lazy()` back into
// `PrimitiveNode` gets the same recursive shape without that indirection,
// since this fixture doesn't split layout into its own module.
export const SectionSchema: z.ZodType<unknown> = z
  .object({
    primitive: z.literal("Section"),
    id: z.string(),
    props: z
      .object({ width: z.enum(["narrow", "default", "wide", "full"]).optional() })
      .optional(),
    children: z.array(z.lazy(() => PrimitiveNode)),
  })
  .strict();

export const ContainerSchema: z.ZodType<unknown> = z
  .object({
    primitive: z.literal("Container"),
    id: z.string(),
    children: z.array(z.lazy(() => PrimitiveNode)),
  })
  .strict();

export const PrimitiveNode = z.discriminatedUnion("primitive", [
  HeroSectionSchema,
  CtaSectionSchema,
  SectionSchema,
  ContainerSchema,
  HeroSchema,
  ButtonSchema,
  FormSchema,
  TextFieldSchema,
]);
export type PrimitiveNode = z.infer<typeof PrimitiveNode>;

// Structurally identical to the real `CatalogEntry` type in
// @sifir/design-system's `src/catalog/index.ts`.
export type CatalogEntry = {
  primitive: string;
  schema: z.ZodTypeAny;
  intent: string;
  whenToUse: string;
  whenNotToUse: string;
  fieldGuidance: Record<string, string>;
  examples: ReadonlyArray<{ caption?: string; value: unknown }>;
};

function entry(primitive: string, schema: z.ZodTypeAny, intent: string): CatalogEntry {
  return {
    primitive,
    schema,
    intent,
    whenToUse: intent,
    whenNotToUse: "",
    fieldGuidance: {},
    examples: [],
  };
}

export const catalog: ReadonlyArray<CatalogEntry> = [
  entry("HeroSection", HeroSectionSchema, "Page-opening hero macro."),
  entry("CtaSection", CtaSectionSchema, "Closing call-to-action macro."),
  entry("Section", SectionSchema, "Structural section wrapper."),
  entry("Container", ContainerSchema, "Width-constrained content wrapper."),
  entry("Hero", HeroSchema, "Bare hero atom (must be wrapped in a Section)."),
  entry("Button", ButtonSchema, "Generic button atom."),
  entry("Form", FormSchema, "Standalone form primitive."),
  entry("TextField", TextFieldSchema, "Form text field."),
];
