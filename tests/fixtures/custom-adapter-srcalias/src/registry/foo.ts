// Stand-in for a primitive schema module living under the adapter's own
// `src/registry/` tree — the real @sifir/design-system's `@/registry/*`
// alias resolves into its `src/` tree the same way (see e.g.
// src/catalog/macros.ts's `@/registry/catalog/*` imports in that repo).
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
