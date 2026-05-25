// T052 — adapter-next Section primitive
import { z } from "zod";
import { Card } from "./card.js";
export const Section = z
    .object({
    primitive: z.literal("Section"),
    id: z.string().min(1),
    title: z.string().optional(),
    cards: z.array(Card).min(1),
})
    .strict();
export const SectionMeta = {
    primitive: "Section",
    version: "1.0.0",
    intent: "Container grouping ≥1 related Cards under an optional heading.",
    whenToUse: "When the page has multiple equal-weight items that share a theme.",
    whenNotToUse: [
        "Use Hero alone if there's one focal block (no grouping needed)",
        "Use a flat list of CTAs if the items are conversion targets, not content",
    ],
    fieldGuidance: {
        title: "Optional heading; omit if Cards' titles speak for themselves.",
        cards: "At least one Card. Cards within a Section share visual weight.",
    },
    examples: [
        {
            primitive: "Section",
            id: "features",
            title: "Why Composer",
            cards: [
                {
                    primitive: "Card",
                    id: "feature-fast",
                    title: "Fast",
                    description: "Compose in milliseconds.",
                },
                {
                    primitive: "Card",
                    id: "feature-safe",
                    title: "Safe",
                    description: "Drift detection prevents accidental overwrites.",
                },
            ],
        },
    ],
    pure: true,
};
//# sourceMappingURL=section.js.map