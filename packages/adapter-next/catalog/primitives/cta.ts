// T052 — adapter-next CTA primitive

import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";

export const CTA = z
  .object({
    primitive: z.literal("CTA"),
    id: z.string().min(1),
    label: z.string().min(1),
    href: z.string().min(1),
    variant: z.enum(["primary", "secondary"]).default("primary"),
  })
  .strict();

export const CTAMeta: PrimitiveMeta = {
  primitive: "CTA",
  version: "1.0.0",
  intent: "Action button — links somewhere and asks the user to do something.",
  whenToUse: "When the page has a primary conversion goal (signup, purchase, navigate).",
  whenNotToUse: [
    "Use a plain link if it's an inline navigation, not a primary action",
    "Use Hero's optional `cta` field if the action lives next to a hero block",
  ],
  fieldGuidance: {
    label: "Verb-first, action-oriented (e.g., 'Start free trial', 'View docs').",
    href: "Either an absolute URL or a Next.js route (`/pricing`, `/docs/quickstart`).",
    variant: "`primary` for the main action; `secondary` for an alternative.",
  },
  examples: [
    {
      primitive: "CTA",
      id: "start-trial",
      label: "Start free trial",
      href: "/signup",
      variant: "primary",
    },
  ],
  pure: true,
};
