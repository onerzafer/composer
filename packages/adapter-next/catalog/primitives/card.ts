// T052 — adapter-next Card primitive

import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";

export const Card = z
  .object({
    primitive: z.literal("Card"),
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    icon: z.string().optional(),
  })
  .strict();

export const CardMeta: PrimitiveMeta = {
  primitive: "Card",
  version: "1.0.0",
  intent: "One unit of grouped content — title + description + optional icon.",
  whenToUse: "Inside a Section, to convey one of several equal-weight items.",
  whenNotToUse: [
    "Use Hero for a single focal block at the top of a page",
    "Use a CTA when the primary goal is conversion, not content",
  ],
  fieldGuidance: {
    title: "Short label (2-5 words).",
    description: "1-2 sentence elaboration.",
    icon: "Optional Lucide icon name (e.g., 'check', 'sparkles').",
  },
  examples: [
    {
      primitive: "Card",
      id: "feature-fast",
      title: "Fast by default",
      description: "Compose in milliseconds; ship in under 30 seconds.",
      icon: "zap",
    },
  ],
  pure: true,
};
