// T052 — adapter-next Page primitive (top-level; emits src/app/<slug>/page.tsx).
import { z } from "zod";
import { Hero } from "./hero.js";
import { Section } from "./section.js";
import { CTA } from "./cta.js";
export const Page = z
    .object({
    primitive: z.literal("Page"),
    slug: z
        .string()
        .min(1)
        .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase alphanumeric + hyphens"),
    title: z.string().min(1),
    tree: z.array(z.union([Hero, Section, CTA])).min(1),
})
    .strict();
export const PageMeta = {
    primitive: "Page",
    version: "1.0.0",
    intent: "Top-level Next.js App Router page (renders to src/app/<slug>/page.tsx).",
    whenToUse: "Every distinct route. Each page is a self-contained composition of nested primitives.",
    whenNotToUse: [
        "Use a custom layout primitive (v0.2+) for shared header/footer",
        "Use API endpoints (adapter-hono in v0.2) for non-page routes",
    ],
    fieldGuidance: {
        slug: "URL path segment (e.g., 'pricing' → /pricing). Lowercase + hyphens.",
        title: "<title> tag content for SEO. 1 line, action-oriented.",
        tree: "Ordered list of nested primitives — Hero, Section, CTA. Rendered in order.",
    },
    examples: [
        {
            primitive: "Page",
            slug: "pricing",
            title: "Pricing",
            tree: [
                {
                    primitive: "Hero",
                    id: "pricing-hero",
                    variant: "centered",
                    title: "Pricing built for teams",
                    subtitle: "Pay only for what you ship.",
                },
                {
                    primitive: "CTA",
                    id: "pricing-start",
                    label: "Start free trial",
                    href: "/signup",
                    variant: "primary",
                },
            ],
        },
    ],
    pure: true,
};
//# sourceMappingURL=page.js.map