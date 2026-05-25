import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";
export declare const Hero: z.ZodObject<{
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
}>;
export declare const HeroMeta: PrimitiveMeta;
//# sourceMappingURL=hero.d.ts.map