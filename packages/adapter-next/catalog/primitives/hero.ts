// T052 — adapter-next Hero primitive

import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";

const HeroCta = z
  .object({
    label: z.string().min(1),
    href: z.string().min(1),
    variant: z.enum(["primary", "secondary"]).optional(),
  })
  .strict();

export const Hero = z
  .object({
    primitive: z.literal("Hero"),
    id: z.string().min(1),
    variant: z.enum(["centered", "overlay"]),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    cta: HeroCta.optional(),
  })
  .strict();

export const HeroMeta: PrimitiveMeta = {
  primitive: "Hero",
  version: "1.0.0",
  intent: "Top-of-page focal block with title + supporting copy + optional CTA.",
  whenToUse: "First impression for a page; primary visual anchor above the fold.",
  whenNotToUse: [
    "Use a Section with cards if conveying multiple equal-weight items",
    "Use a CTA alone when conversion is the only goal",
  ],
  fieldGuidance: {
    title: "1-line action-oriented; leads with the value proposition.",
    subtitle: "Optional supporting copy, max 2 lines.",
    variant: "`centered` for symmetric typographic heroes; `overlay` for image-led pages.",
  },
  examples: [
    {
      primitive: "Hero",
      id: "marketing-hero",
      variant: "centered",
      title: "Composer ships",
      subtitle: "Schema-compiled composition for any Next.js project.",
    },
  ],
  pure: true,
};
