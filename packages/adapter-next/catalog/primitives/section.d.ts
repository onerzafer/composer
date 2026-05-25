import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";
export declare const Section: z.ZodObject<{
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
}>;
export declare const SectionMeta: PrimitiveMeta;
//# sourceMappingURL=section.d.ts.map