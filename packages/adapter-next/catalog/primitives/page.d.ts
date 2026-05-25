import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";
export declare const Page: z.ZodObject<{
    primitive: z.ZodLiteral<"Page">;
    slug: z.ZodString;
    title: z.ZodString;
    tree: z.ZodArray<z.ZodUnion<[z.ZodObject<{
        primitive: z.ZodLiteral<"Hero">;
        id: z.ZodString;
        variant: z.ZodEnum<["centered", "overlay"]>;
        title: z.ZodString;
        subtitle: z.ZodOptional<z.ZodString>;
        cta: z.ZodOptional<z.ZodObject<{
            label: z.ZodString;
            href: z.ZodString;
            variant: z.ZodOptional<z.ZodEnum<["primary", "secondary"]>>;
        }, "strict", z.ZodTypeAny, {
            label: string;
            href: string;
            variant?: "primary" | "secondary" | undefined;
        }, {
            label: string;
            href: string;
            variant?: "primary" | "secondary" | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        primitive: "Hero";
        id: string;
        variant: "centered" | "overlay";
        title: string;
        subtitle?: string | undefined;
        cta?: {
            label: string;
            href: string;
            variant?: "primary" | "secondary" | undefined;
        } | undefined;
    }, {
        primitive: "Hero";
        id: string;
        variant: "centered" | "overlay";
        title: string;
        subtitle?: string | undefined;
        cta?: {
            label: string;
            href: string;
            variant?: "primary" | "secondary" | undefined;
        } | undefined;
    }>, z.ZodObject<{
        primitive: z.ZodLiteral<"Section">;
        id: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        cards: z.ZodArray<z.ZodObject<{
            primitive: z.ZodLiteral<"Card">;
            id: z.ZodString;
            title: z.ZodString;
            description: z.ZodString;
            icon: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            primitive: "Card";
            id: string;
            title: string;
            description: string;
            icon?: string | undefined;
        }, {
            primitive: "Card";
            id: string;
            title: string;
            description: string;
            icon?: string | undefined;
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        primitive: "Section";
        id: string;
        cards: {
            primitive: "Card";
            id: string;
            title: string;
            description: string;
            icon?: string | undefined;
        }[];
        title?: string | undefined;
    }, {
        primitive: "Section";
        id: string;
        cards: {
            primitive: "Card";
            id: string;
            title: string;
            description: string;
            icon?: string | undefined;
        }[];
        title?: string | undefined;
    }>, z.ZodObject<{
        primitive: z.ZodLiteral<"CTA">;
        id: z.ZodString;
        label: z.ZodString;
        href: z.ZodString;
        variant: z.ZodDefault<z.ZodEnum<["primary", "secondary"]>>;
    }, "strict", z.ZodTypeAny, {
        primitive: "CTA";
        id: string;
        variant: "primary" | "secondary";
        label: string;
        href: string;
    }, {
        primitive: "CTA";
        id: string;
        label: string;
        href: string;
        variant?: "primary" | "secondary" | undefined;
    }>]>, "many">;
}, "strict", z.ZodTypeAny, {
    primitive: "Page";
    title: string;
    slug: string;
    tree: ({
        primitive: "Hero";
        id: string;
        variant: "centered" | "overlay";
        title: string;
        subtitle?: string | undefined;
        cta?: {
            label: string;
            href: string;
            variant?: "primary" | "secondary" | undefined;
        } | undefined;
    } | {
        primitive: "Section";
        id: string;
        cards: {
            primitive: "Card";
            id: string;
            title: string;
            description: string;
            icon?: string | undefined;
        }[];
        title?: string | undefined;
    } | {
        primitive: "CTA";
        id: string;
        variant: "primary" | "secondary";
        label: string;
        href: string;
    })[];
}, {
    primitive: "Page";
    title: string;
    slug: string;
    tree: ({
        primitive: "Hero";
        id: string;
        variant: "centered" | "overlay";
        title: string;
        subtitle?: string | undefined;
        cta?: {
            label: string;
            href: string;
            variant?: "primary" | "secondary" | undefined;
        } | undefined;
    } | {
        primitive: "Section";
        id: string;
        cards: {
            primitive: "Card";
            id: string;
            title: string;
            description: string;
            icon?: string | undefined;
        }[];
        title?: string | undefined;
    } | {
        primitive: "CTA";
        id: string;
        label: string;
        href: string;
        variant?: "primary" | "secondary" | undefined;
    })[];
}>;
export declare const PageMeta: PrimitiveMeta;
//# sourceMappingURL=page.d.ts.map