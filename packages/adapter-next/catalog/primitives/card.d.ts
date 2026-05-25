import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";
export declare const Card: z.ZodObject<{
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
}>;
export declare const CardMeta: PrimitiveMeta;
//# sourceMappingURL=card.d.ts.map