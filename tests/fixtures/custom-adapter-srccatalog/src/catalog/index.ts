// Stand-in for @sifir/design-system's real `src/catalog/` — in that repo,
// `catalog/index.ts` is a thin entry point and the actual primitive schemas
// + metadata live one level up in a sibling `src/` tree (see
// tests/fixtures/sifir-design-system-catalog/README.md for the full shape
// this mirrors, at a fraction of the size).
import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";

export const Widget = z
  .object({
    primitive: z.literal("Widget"),
    id: z.string(),
    label: z.string().min(1),
  })
  .strict();

export const WidgetMeta: PrimitiveMeta = {
  primitive: "Widget",
  version: "0.1.0",
  intent: "A minimal labeled widget block.",
  whenToUse: "Any place needing a single labeled block.",
  whenNotToUse: [],
  fieldGuidance: { label: "Short display label." },
  examples: [{ primitive: "Widget", id: "demo", label: "Demo" }],
};
