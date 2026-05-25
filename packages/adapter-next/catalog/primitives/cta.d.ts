import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";
export declare const CTA: z.ZodObject<{
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
}>;
export declare const CTAMeta: PrimitiveMeta;
//# sourceMappingURL=cta.d.ts.map